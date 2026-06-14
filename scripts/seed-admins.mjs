#!/usr/bin/env node
/**
 * Idempotent seed script: creates the 2 initial Admin accounts.
 *
 * Run ONCE after first deploy:
 *   node scripts/seed-admins.mjs
 *
 * Requires the following env vars (copy .env.example -> .env.local and fill in):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * It will NOT overwrite or modify accounts that already exist.
 * Passwords must be changed in the app's Nalozi page after first login.
 */

import { createClient } from "@supabase/supabase-js";
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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Define your initial admin accounts here.
 * Change usernames/passwords/emails before running.
 * DO NOT commit real passwords to git.
 */
const INITIAL_ADMINS = [
  {
    username: "admin1",
    password: "ChangeMe123!",
    recovery_email: "admin1@example.com",
  },
  {
    username: "admin2",
    password: "ChangeMe456!",
    recovery_email: "admin2@example.com",
  },
];

async function seedAdmin({ username, password, recovery_email }) {
  const email = `${username}@gym.local`;

  // Check if already exists
  const { data: existing } = await admin.from("staff")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    console.log(`  ⏭  Skipping "${username}" (already exists)`);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      role: "admin",
      recovery_email,
    },
  });

  if (error) {
    console.error(`  ❌  Failed to create "${username}": ${error.message}`);
    return;
  }

  console.log(`  ✅  Created admin "${username}" (id: ${data.user.id})`);
}

async function main() {
  console.log("Seeding initial admin accounts...\n");

  for (const admin of INITIAL_ADMINS) {
    await seedAdmin(admin);
  }

  console.log("\nDone. Log in and change passwords via Settings.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
