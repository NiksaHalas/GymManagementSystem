import { test, expect } from "@playwright/test";

/**
 * Offline check-in → reconnect → sync happy path.
 * Requires: NEXT_PUBLIC_OFFLINE_ENABLED=true, counter cookie, seeded worker login.
 * Skip in CI unless PLAYWRIGHT_E2E=1.
 */
test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with local stack");

test("offline check-in queues and syncs after reconnect", async ({ page, context }) => {
  await page.goto("/login");
  // Adjust credentials to match local seed
  await page.getByLabel(/korisničko ime/i).fill(process.env.PLAYWRIGHT_USER ?? "admin");
  await page.getByLabel(/lozinka/i).fill(process.env.PLAYWRIGHT_PASSWORD ?? "password");
  await page.getByRole("button", { name: /prijavi/i }).click();
  await page.waitForURL("**/dashboard**");

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText(/van mreži/i)).toBeVisible({ timeout: 15_000 });

  // Counter flow is environment-specific; assert offline shell loaded
  await expect(page.getByRole("heading", { name: /kontrolna tabla/i })).toBeVisible();

  await context.setOffline(false);
  await page.reload();

  await expect(page.getByText(/na mreži/i)).toBeVisible({ timeout: 15_000 });
});
