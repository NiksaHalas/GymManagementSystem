#!/usr/bin/env node
/**
 * Push Auth redirect URLs + OTP expiry to the linked Supabase project.
 * Requires SUPABASE_ACCESS_TOKEN (from `supabase login` or dashboard → Access Tokens).
 *
 * Usage:
 *   node scripts/push-supabase-auth-config.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "qkmrssvfeljfkqbbxfpr";

function loadEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  const vars = {};
  try {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      vars[key] = value;
    }
  } catch {
    // fall through
  }
  return vars;
}

function mergeRedirectUrls(existing, siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  const required = [
    `${base}/auth/callback`,
    `${base}/reset`,
    "http://localhost:3000/auth/callback",
    "http://127.0.0.1:3000/auth/callback",
    "http://localhost:3000/reset",
    "http://127.0.0.1:3000/reset",
  ];
  const current = (existing ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = [...new Set([...current, ...required])];
  return merged.join(",");
}

async function main() {
  const env = loadEnvLocal();
  const token =
    process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "❌  SUPABASE_ACCESS_TOKEN is not set. Run `supabase login` or export a personal access token.",
    );
    process.exit(1);
  }

  // Prefer an inline env var (the documented deploy usage) over .env.local, which
  // typically holds a dev localhost URL. Consistent with how the token is resolved.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Guard: never let a dev .env.local silently push a localhost site_url to the
  // remote project — that breaks password-reset / magic-link emails for real
  // users. Require an explicit opt-in for local/dev pushes.
  const allowLocalhost = process.argv.includes("--allow-localhost");
  const isLocalhost = /localhost|127\.0\.0\.1/i.test(siteUrl);
  if (isLocalhost && !allowLocalhost) {
    console.error(
      `❌  Refusing to push a localhost site_url (${siteUrl}).\n` +
        "    This script reads NEXT_PUBLIC_SITE_URL — most likely from a dev .env.local.\n" +
        "    Run with the production URL instead, e.g.:\n" +
        "      NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app npm run auth:push-config\n" +
        "    If you really intend to target local dev, re-run with --allow-localhost.",
    );
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const getRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    { headers },
  );
  if (!getRes.ok) {
    console.error("❌  Failed to read auth config:", getRes.status, await getRes.text());
    process.exit(1);
  }

  const current = await getRes.json();
  const uri_allow_list = mergeRedirectUrls(current.uri_allow_list, siteUrl);

  // Leaked-password protection (HaveIBeenPwned) requires a Supabase Pro plan.
  // Off by default so the free plan doesn't 402; opt in once upgraded:
  //   ENABLE_HIBP=true npm run auth:push-config
  const enableHibp = process.env.ENABLE_HIBP === "true";

  const patchRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        site_url: siteUrl.replace(/\/$/, ""),
        uri_allow_list,
        mailer_otp_exp: 3600,
        // Security hardening (see plan P1/P2):
        // - disable public signup so synthetic *@gym.local accounts can only be
        //   created via the service-role admin channel (defense in depth alongside
        //   the handle_new_user trigger that no longer trusts metadata role).
        // - enforce password policy server-side (the /reset flow runs updateUser
        //   from the browser, so client-side zod alone is not authoritative).
        disable_signup: true,
        password_min_length: 8,
        ...(enableHibp ? { password_hibp_enabled: true } : {}),
      }),
    },
  );

  if (!patchRes.ok) {
    console.error("❌  Failed to update auth config:", patchRes.status, await patchRes.text());
    process.exit(1);
  }

  console.log("✅  Auth config updated:");
  console.log("   site_url:", siteUrl.replace(/\/$/, ""));
  console.log("   mailer_otp_exp: 3600");
  console.log("   uri_allow_list includes /auth/callback and /reset");
  console.log("   disable_signup: true");
  console.log("   password_min_length: 8");
  console.log(
    enableHibp
      ? "   password_hibp_enabled: true"
      : "   password_hibp_enabled: skipped (set ENABLE_HIBP=true on Pro plan)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
