#!/usr/bin/env node
/**
 * Prints the numbers quoted in the README, measured rather than estimated.
 *
 *   node scripts/repo-metrics.mjs           # repo + local database
 *   node scripts/repo-metrics.mjs --bench   # also runs supabase/bench/checkin_latency.sql
 *
 * Database numbers come from the LOCAL Supabase stack (`supabase start`, seeded by
 * `supabase db reset`), read through `docker exec` into its Postgres container.
 * Without it, only the repo numbers are printed.
 */

import { execSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bench = process.argv.includes("--bench");

function projectId() {
  const toml = readFileSync(join(root, "supabase/config.toml"), "utf-8");
  return toml.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
}

const container = `supabase_db_${projectId()}`;

function psql(sql) {
  const r = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-At", "-F", "\t"], {
    input: sql,
    encoding: "utf-8",
  });
  if (r.status !== 0) throw new Error(r.stderr || `psql exit ${r.status}`);
  return r.stdout.trim();
}

// --- Repo -------------------------------------------------------------------

const migrations = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql"));

const pgtapFiles = readdirSync(join(root, "supabase/tests")).filter((f) => f.endsWith(".test.sql"));
const pgtapAssertions = pgtapFiles.reduce((sum, f) => {
  const plan = readFileSync(join(root, "supabase/tests", f), "utf-8").match(/select\s+plan\((\d+)\)/i);
  return sum + (plan ? Number(plan[1]) : 0);
}, 0);

const vitestList = JSON.parse(
  execSync("npx vitest list --json", {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const vitestFiles = new Set(vitestList.map((t) => t.file));

console.log("Repo");
console.log(`  migrations                ${migrations.length}`);
console.log(`  Vitest tests              ${vitestList.length} in ${vitestFiles.size} files`);
console.log(`  pgTAP assertions          ${pgtapAssertions} in ${pgtapFiles.length} files`);

// --- Local database ---------------------------------------------------------

let db;
try {
  db = psql(`
    select
      (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
           and not exists (select 1 from pg_depend d
                           where d.objid = p.oid and d.deptype = 'e')),
      (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
           and has_function_privilege('authenticated', p.oid, 'execute')
           and not exists (select 1 from pg_depend d
                           where d.objid = p.oid and d.deptype = 'e')),
      (select count(*) from pg_policies where schemaname = 'public'),
      (select count(*) from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
      (select count(*) from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity),
      (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where c.relnamespace = 'public'::regnamespace and not t.tgisinternal),
      (select count(*) from cron.job),
      coalesce((select v::text from demo.meta where k = 'last_reset'), '{}');
  `).split("\t");
} catch {
  console.log(`\nLocal database: not reachable (${container}) — run \`supabase start\` for DB numbers.`);
  process.exit(0);
}

const [fns, rpcs, policies, tables, rlsTables, triggers, cronJobs, demoJson] = db;
const demo = JSON.parse(demoJson);

console.log("\nDatabase (local, after `supabase db reset`)");
console.log(`  public functions          ${fns} (${rpcs} callable by signed-in staff)`);
console.log(`  RLS policies              ${policies}`);
console.log(`  tables with RLS           ${rlsTables} of ${tables}`);
console.log(`  triggers                  ${triggers}`);
console.log(`  pg_cron jobs              ${cronJobs}`);

if (demo.today) {
  console.log(`\nDemo dataset (demo.reset() for ${demo.today}, 13 months incl. 1 warm-up)`);
  console.log(`  members                   ${demo.members}`);
  console.log(`  check-ins                 ${demo.checkins}`);
  console.log(`  payments                  ${demo.payments}`);
  console.log(`  worker shifts             ${demo.shifts}`);
}

if (bench) {
  const out = psql(readFileSync(join(root, "supabase/bench/checkin_latency.sql"), "utf-8"));
  const row = out.split("\n").find((l) => /^\d+\t/.test(l));
  const [runs, p50, p95, max, rows] = row.split("\t");
  console.log(`\ncreate_checkin() inside Postgres (${runs} calls, ${rows} check-ins in table)`);
  console.log(`  p50 ${p50} ms · p95 ${p95} ms · max ${max} ms  (DB time only; no network or app)`);
}
