import "server-only";

/**
 * Public demo mode (hosted demo only — never set on a real gym deployment).
 * Server-only flag: not NEXT_PUBLIC, so it never reaches the browser bundle.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Accounts the "Isprobaj demo" buttons sign in as (see scripts/demo-staff.mjs). */
export const DEMO_ACCOUNTS = {
  worker: { username: "jelena", role: "user" },
  admin: { username: "dragan", role: "admin" },
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export function demoPassword(role: DemoRole): string | undefined {
  return role === "admin"
    ? process.env.DEMO_ADMIN_PASSWORD
    : process.env.DEMO_WORKER_PASSWORD;
}

export const DEMO_DISABLED_MESSAGE = "Onemogućeno u demo režimu.";
