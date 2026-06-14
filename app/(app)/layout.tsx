import { requireUser } from "@/lib/auth/session";
import { isCounterDevice } from "@/lib/auth/counter";
import { ensureOpenShift } from "@/lib/shifts/actions";
import { AppTopBar } from "@/components/app-top-bar";

/**
 * Authenticated application shell.
 * - requireUser() redirects to /login if not authenticated or account is disabled.
 * - On a counter device, ensures an open shift exists (auto-open on login).
 * - Admin-only sub-routes (/nalozi, /smene) are gated by requireAdmin() inside those layouts.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireUser();
  const counter = await isCounterDevice();

  // Auto-open shift on the counter device on every page load (idempotent)
  if (counter) {
    await ensureOpenShift(staff.id);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopBar staff={staff} isCounter={counter} />
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
