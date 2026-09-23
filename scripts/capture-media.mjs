#!/usr/bin/env node
/**
 * Captures the README screenshots and the check-in GIF from a running demo.
 *
 *   BASE_URL=http://localhost:3000 node scripts/capture-media.mjs
 *   PW_CHANNEL=msedge ...   # optional: use an installed browser
 *
 * The target must run with DEMO_MODE=true (the script signs in with the demo
 * buttons) on demo data (supabase/demo/demo_generator.sql). Members for the
 * shots are picked from the same database through the service role, so env
 * must point at the database behind BASE_URL:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (process env or .env.local)
 *
 * The GIF flow records a real payment and check-in; the nightly demo reset
 * (or `select demo.reset()` locally) puts the data back.
 *
 * Output: docs/media/*.png and docs/media/checkin-flow.gif (needs ffmpeg on PATH).
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../docs/media");
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const VIEWPORT = { width: 1440, height: 900 };

// Load .env.local without overriding the process env (same as the other scripts).
function loadEnv() {
  try {
    const content = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // no .env.local — rely on process env
  }
}

loadEnv();

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function all(table, columns, filter = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    // Stable order, or rows can shift between pages.
    const { data, error } = await filter(db.from(table).select(columns))
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const fullName = (m) => `${m.first_name} ${m.last_name}`;

/** Picks the members the shots use, from today's demo data. */
async function pickMembers() {
  // Business day in Belgrade, as business_today() computes it (YYYY-MM-DD).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date());

  const [members, memberships, todays, debts] = await Promise.all([
    all("member", "id, member_no, first_name, last_name, comment, archived"),
    all(
      "membership",
      "member_id, status, sessions_left, created_at, membership_type(package, training_category(code))",
    ),
    all("checkin", "member_id", (q) => q.eq("business_date", today)),
    all("reserved_session", "member_id", (q) => q.eq("settled", false)),
  ]);
  const visitCounts = new Map();
  for (const c of await all("checkin", "member_id", (q) => q.not("member_id", "is", null))) {
    visitCounts.set(c.member_id, (visitCounts.get(c.member_id) ?? 0) + 1);
  }

  const inToday = new Set(todays.map((c) => c.member_id));
  const inDebt = new Set(debts.map((d) => d.member_id));
  const byMember = new Map();
  for (const m of memberships) {
    const list = byMember.get(m.member_id) ?? [];
    list.push(m);
    byMember.set(m.member_id, list);
  }
  const latest = (id) =>
    (byMember.get(id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const live = (id) =>
    (byMember.get(id) ?? []).filter((m) => ["aktivna", "pauzirana", "zakazana"].includes(m.status));
  // Unique names only, so the in-app search result is unambiguous.
  const nameCount = new Map();
  for (const m of members) nameCount.set(fullName(m), (nameCount.get(fullName(m)) ?? 0) + 1);
  const eligible = members
    .filter((m) => !m.archived && !m.comment && !inToday.has(m.id) && !inDebt.has(m.id))
    .filter((m) => nameCount.get(fullName(m)) === 1)
    .sort((a, b) => a.member_no - b.member_no);

  // Check-in dialog: an active trainer package with a few sessions left.
  const trainer = eligible.find((m) => {
    const [ms, ...rest] = live(m.id);
    return (
      rest.length === 0 &&
      ms?.status === "aktivna" &&
      ms.membership_type.training_category.code === "individualni" &&
      ms.sessions_left >= 3 &&
      ms.sessions_left <= 8
    );
  });
  // GIF: a regular whose monthly membership has lapsed, so they pay, then check in.
  const lapsed = eligible.find((m) => {
    const ms = latest(m.id);
    return (
      live(m.id).length === 0 &&
      ms?.status === "istekla" &&
      ms.membership_type.package === "30/1" &&
      ms.membership_type.training_category.code === "otvoreni" &&
      (visitCounts.get(m.id) ?? 0) >= 20
    );
  });
  // Member card: the longest history.
  const regular = [...eligible].sort(
    (a, b) => (visitCounts.get(b.id) ?? 0) - (visitCounts.get(a.id) ?? 0),
  )[0];

  if (!trainer || !lapsed || !regular) throw new Error("No suitable members — is this demo data?");
  return { today, trainer, lapsed, regular };
}

async function newContext(browser, video) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "light",
    locale: "sr-RS",
    ...(video ? { recordVideo: { dir: join(OUT, ".video"), size: VIEWPORT } } : {}),
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("demo-banner-dismissed", "1");
    } catch {
      // ignore
    }
    // Hide the Next.js dev-mode badge when capturing from `next dev`.
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(style);
    });
  });
  return context;
}

async function signIn(page, role) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle"); // hydrated, or the click is lost
  await page.getByRole("button", { name: `Isprobaj kao ${role}` }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await settle(page);
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

async function shot(page, name, options = {}) {
  await page.screenshot({ path: join(OUT, `${name}.png`), ...options });
  console.log(`  ✅  ${name}.png`);
}

async function searchMember(page, member, { slow = false } = {}) {
  await page.getByRole("combobox").filter({ hasText: "Pretraži člana" }).click();
  await page
    .getByPlaceholder("Ime, prezime ili broj člana…")
    .pressSequentially(member.last_name, { delay: slow ? 90 : 0 });
  const option = page.getByRole("option").filter({ hasText: fullName(member) }).first();
  await option.waitFor();
  if (slow) await page.waitForTimeout(700);
  return option;
}

async function counterShots(browser, picks) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await signIn(page, "radnik");
  await shot(page, "dashboard");

  await (await searchMember(page, picks.trainer)).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Potvrdi dolazak" }).waitFor();
  await settle(page);
  await shot(page, "checkin-dialog");
  await dialog.getByRole("button", { name: "Otkaži" }).click();
  await context.close();
}

async function adminShots(browser, picks) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await signIn(page, "admin");

  await page.goto(`${BASE_URL}/clanovi/${picks.regular.id}`);
  await settle(page);
  // A taller viewport: header, current membership and the start of the history.
  await page.setViewportSize({ width: VIEWPORT.width, height: 1500 });
  await settle(page);
  await shot(page, "member-card");
  await page.setViewportSize(VIEWPORT);

  await page.goto(`${BASE_URL}/pazar?view=month`);
  await settle(page);
  await shot(page, "takings-month");

  await page.goto(`${BASE_URL}/smene`);
  await settle(page);
  await shot(page, "shifts");

  await page.goto(`${BASE_URL}/cene`);
  await settle(page);
  await shot(page, "prices");
  await context.close();
}

/** Search → check-in → pay the lapsed membership → confirm → "Otišao". */
async function checkinGif(browser, picks) {
  const context = await newContext(browser, true);
  const page = await context.newPage();
  try {
    await recordCheckin(page, picks);
  } catch (err) {
    await page.screenshot({ path: join(OUT, ".video", "failed.png") });
    await context.close();
    throw err;
  }
  const video = page.video();
  await context.close();
  const webm = await video.path();

  const gif = join(OUT, "checkin-flow.gif");
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error", "-i", webm,
      "-vf",
      "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5",
      gif,
    ],
    { stdio: "inherit" },
  );
  if (ff.status !== 0) throw new Error("ffmpeg failed — is it on PATH?");
  await rm(join(OUT, ".video"), { recursive: true, force: true });
  console.log("  ✅  checkin-flow.gif");
}

async function recordCheckin(page, picks) {
  await signIn(page, "radnik");
  const pause = (ms = 900) => page.waitForTimeout(ms);
  await pause(600);

  await (await searchMember(page, picks.lapsed, { slow: true })).click();
  const checkin = page.getByRole("dialog").filter({ hasText: "Prijava dolaska" });
  await checkin.getByRole("button", { name: "Potvrdi dolazak" }).waitFor();
  await pause(1400);

  await checkin.getByRole("button", { name: "Naplati članarinu" }).click();
  const payment = page.getByRole("dialog").filter({ hasText: "Naplata" });
  await payment.getByRole("button", { name: "Naplati" }).waitFor();
  await pause();
  await payment.getByRole("combobox").filter({ hasText: "Kategorija" }).click();
  await page.getByRole("option", { name: "Otvoreni tip" }).click();
  await pause(500);
  await payment.getByRole("combobox").filter({ hasText: "Paket" }).click();
  await page.getByRole("option", { name: /30\/1/ }).click();
  await pause(1400);
  await payment.getByRole("button", { name: "Naplati", exact: true }).click();
  await payment.waitFor({ state: "detached" });
  await pause();

  // Paying closes the check-in dialog; with the membership now active, check in again.
  await (await searchMember(page, picks.lapsed, { slow: true })).click();
  await checkin.getByRole("button", { name: "Potvrdi dolazak" }).waitFor();
  await pause(1000);
  // First free key (occupied keys are styled text-destructive).
  await checkin.locator("button.h-8:not(.text-destructive)").first().click();
  await pause(900);
  await checkin.getByRole("button", { name: "Potvrdi dolazak" }).click();
  const row = page.getByRole("row").filter({ hasText: fullName(picks.lapsed) });
  await row.waitFor();
  await pause(1600);
  await row.getByRole("button", { name: "Otišao" }).click();
  await pause(1600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const picks = await pickMembers();
  console.log(`Capturing ${BASE_URL} (business day ${picks.today})`);
  console.log(
    `  check-in: ${fullName(picks.trainer)} · GIF: ${fullName(picks.lapsed)} · card: ${fullName(picks.regular)}`,
  );

  // PW_CHANNEL=msedge|chrome uses an installed browser instead of `npx playwright install`.
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || undefined,
    args: ["--lang=sr-Latn-RS"], // date inputs render dd.mm.yyyy, as at the counter
  });
  try {
    if (!process.env.ONLY_GIF) {
      await counterShots(browser, picks);
      await adminShots(browser, picks);
    }
    await checkinGif(browser, picks);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
