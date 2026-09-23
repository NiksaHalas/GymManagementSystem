#!/usr/bin/env node
/**
 * Demo environment only: creates the staff accounts the demo data generator
 * (supabase/demo/demo_generator.sql) expects, and keeps the two sign-in accounts'
 * passwords in sync with the "Isprobaj demo" buttons.
 *
 *   node scripts/demo-staff.mjs
 *
 * Requires (e.g. in .env.local of the demo project):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   DEMO_ADMIN_PASSWORD   — "dragan" (Admin); must match the Vercel env of the demo
 *   DEMO_WORKER_PASSWORD  — "jelena" (counter worker); must match the Vercel env
 *
 * The other demo staff (marko, ana, nikola, milica) get a random password nobody
 * needs: they only appear in the generated history. Never run this against a
 * real gym project.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (Next.js doesn't process it for plain Node scripts)
function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
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
    // .env.local may not exist; fall through to process.env
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌  Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const signInPasswords = {
  dragan: process.env.DEMO_ADMIN_PASSWORD,
  jelena: process.env.DEMO_WORKER_PASSWORD,
};

const weak = Object.entries(signInPasswords).filter(([, p]) => !p || p.length < 12);
if (weak.length > 0) {
  console.error(
    "❌  Set DEMO_ADMIN_PASSWORD and DEMO_WORKER_PASSWORD (min 12 chars). " +
      "They must match the demo's Vercel env so the demo buttons can sign in.",
  );
  process.exit(1);
}

const DEMO_STAFF = [
  { username: "dragan", role: "admin" },
  { username: "jelena", role: "user" },
  { username: "marko", role: "user" },
  { username: "ana", role: "user" },
  { username: "nikola", role: "user" },
  { username: "milica", role: "user" },
];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureStaff({ username, role }) {
  const email = `${username}@gym.local`;
  const password = signInPasswords[username] ?? randomBytes(24).toString("base64url");

  const { data: existing, error: lookupError } = await admin
    .from("staff")
    .select("id, role, active")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error(`  ❌  Could not look up "${username}": ${lookupError.message}`);
    return false;
  }

  let id = existing?.id;

  if (!existing) {
    // Role is never taken from metadata (handle_new_user always creates 'user').
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error) {
      console.error(`  ❌  Failed to create "${username}": ${error.message}`);
      return false;
    }
    id = data.user.id;
    console.log(`  ✅  Created "${username}"`);
  } else if (signInPasswords[username]) {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) {
      console.error(`  ❌  Failed to sync password for "${username}": ${error.message}`);
      return false;
    }
    console.log(`  🔁  Synced password for "${username}"`);
  } else {
    console.log(`  ⏭  "${username}" already exists`);
  }

  if (!existing || existing.role !== role || !existing.active) {
    const { error } = await admin
      .from("staff")
      .update({ role, active: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error(`  ❌  Failed to set role for "${username}": ${error.message}`);
      return false;
    }
  }

  return true;
}

async function main() {
  console.log("Ensuring demo staff accounts...\n");
  let ok = true;
  for (const staff of DEMO_STAFF) {
    ok = (await ensureStaff(staff)) && ok;
  }
  if (!ok) process.exit(1);
  console.log("\nDone. Next: apply supabase/demo/*.sql and run `select demo.reset();`.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
