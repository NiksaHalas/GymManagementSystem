#!/usr/bin/env node
/**
 * USB backup companion script (PRD §3.15, Tech.md §8).
 *
 * Usage:
 *   node scripts/backup-usb.mjs [usb-path]
 *
 * Env (local only — never commit):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   DATABASE_URL (optional — for pg_dump; falls back to JSON export)
 *
 * Writes timestamped dumps under <usb-path>/gym-backup/ and keeps the last 7 runs.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const TABLES = [
  "staff",
  "shift",
  "member",
  "training_category",
  "membership_type",
  "price",
  "membership",
  "payment",
  "checkin",
  "session_log",
  "reserved_session",
  "gym_key",
  "login_attempt",
];

const RETAIN = 7;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function pgDump(outFile, databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", [databaseUrl, "--format=custom", "--file", outFile], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`pg_dump exit ${code}`))));
  });
}

async function jsonExport(outDir, supabase) {
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    await writeFile(join(outDir, `${table}.json`), JSON.stringify(data ?? [], null, 0));
  }
}

async function rotate(baseDir) {
  const entries = await readdir(baseDir).catch(() => []);
  const dirs = [];
  for (const name of entries) {
    const p = join(baseDir, name);
    const s = await stat(p).catch(() => null);
    if (s?.isDirectory()) dirs.push({ name, mtime: s.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  for (const old of dirs.slice(RETAIN)) {
    await rm(join(baseDir, old.name), { recursive: true, force: true });
  }
}

async function main() {
  const usbPath = process.argv[2] ?? process.env.GYM_USB_BACKUP_PATH;
  if (!usbPath) {
    console.error("Provide USB path: node scripts/backup-usb.mjs D:\\\\BACKUP");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const baseDir = join(usbPath, "gym-backup");
  const runDir = join(baseDir, stamp());
  await mkdir(runDir, { recursive: true });

  if (databaseUrl) {
    const dumpFile = join(runDir, "full.dump");
    console.log("Running pg_dump →", dumpFile);
    await pgDump(dumpFile, databaseUrl);
  } else {
    console.log("DATABASE_URL unset — JSON export fallback");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await jsonExport(runDir, supabase);
  }

  await rotate(baseDir);
  console.log("Backup complete:", runDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
