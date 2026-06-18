#!/usr/bin/env node
/**
 * Directly set a user's password via the service-role admin API (no email needed).
 * Use for emergency password rotation (P0) when recovery email / Resend isn't set up.
 *
 * Reads credentials from env (or .env.local). NEVER pass the password on the CLI
 * (it leaks into shell history) — set it as an env var for the single run.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_USERNAME="admin1"; $env:NEW_PASSWORD="<strong-pass>"; node scripts/set-admin-password.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local or env).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  try {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local optional; fall through to process.env
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USERNAME = process.env.ADMIN_USERNAME;
const NEW_PASSWORD = process.env.NEW_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!USERNAME) {
  console.error("❌  Set ADMIN_USERNAME (e.g. admin1).");
  process.exit(1);
}
if (!NEW_PASSWORD || NEW_PASSWORD.length < 8) {
  console.error("❌  Set NEW_PASSWORD (min 8 chars).");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Resolve the auth user id from the staff row (username -> id).
  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("id, username, role")
    .eq("username", USERNAME)
    .maybeSingle();

  if (staffErr) {
    console.error("❌  Staff lookup failed:", staffErr.message);
    process.exit(1);
  }
  if (!staff) {
    console.error(`❌  No staff row for username "${USERNAME}".`);
    process.exit(1);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(staff.id, {
    password: NEW_PASSWORD,
  });

  if (updErr) {
    console.error("❌  Password update failed:", updErr.message);
    process.exit(1);
  }

  console.log(`✅  Password updated for "${staff.username}" (role: ${staff.role}).`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
