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
 * Initial admin accounts. Passwords and recovery emails are read from env so they
 * are NEVER committed to git (a public repo with default passwords = live admin
 * accounts anyone can log into). Set these before running, e.g. in .env.local:
 *   SEED_ADMIN1_USERNAME, SEED_ADMIN1_PASSWORD, SEED_ADMIN1_EMAIL
 *   SEED_ADMIN2_USERNAME, SEED_ADMIN2_PASSWORD, SEED_ADMIN2_EMAIL
 */
const INITIAL_ADMINS = [
  {
    username: process.env.SEED_ADMIN1_USERNAME ?? "admin1",
    password: process.env.SEED_ADMIN1_PASSWORD,
    recovery_email: process.env.SEED_ADMIN1_EMAIL,
  },
  {
    username: process.env.SEED_ADMIN2_USERNAME ?? "admin2",
    password: process.env.SEED_ADMIN2_PASSWORD,
    recovery_email: process.env.SEED_ADMIN2_EMAIL,
  },
];

// Fail fast if any password is missing — never fall back to a hardcoded default.
const missing = INITIAL_ADMINS.filter((a) => !a.password || a.password.length < 8);
if (missing.length > 0) {
  console.error(
    "❌  Missing/short admin password(s). Set SEED_ADMIN1_PASSWORD and SEED_ADMIN2_PASSWORD " +
      "(min 8 chars) in the environment before running. Defaults are intentionally not provided.",
  );
  process.exit(1);
}

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

  // Role is NOT set via metadata (handle_new_user always creates 'user');
  // we grant admin explicitly below via a service-role update.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      recovery_email,
    },
  });

  if (error) {
    console.error(`  ❌  Failed to create "${username}": ${error.message}`);
    return;
  }

  const { error: roleError } = await admin
    .from("staff")
    .update({ role: "admin", updated_at: new Date().toISOString() })
    .eq("id", data.user.id);

  if (roleError) {
    console.error(
      `  ❌  Created "${username}" but failed to grant admin role: ${roleError.message}`,
    );
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
