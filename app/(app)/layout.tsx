import { requireUser } from "@/lib/auth/session";
import { isCounterDevice } from "@/lib/auth/counter";
import { openOrResumeShift } from "@/lib/shifts/actions";
import { fetchPendingAttributionCount } from "@/lib/shifts/queries";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { ShiftAttributionBanner } from "@/components/shift-attribution-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Authenticated application shell.
 * - requireUser() redirects to /login if not authenticated or account is disabled.
 * - On a counter device, attempts open_or_resume_shift (fail-open; banner on foreign/error).
 * - Admin-only sub-routes (/nalozi, /smene) are gated by requireAdmin() inside those layouts.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireUser();
  const counter = await isCounterDevice();

  const shiftOpenResult = counter ? await openOrResumeShift() : null;

  const pendingAttributionCount =
    staff.role === "admin" ? await fetchPendingAttributionCount() : 0;

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          staff={staff}
          isCounter={counter}
          pendingAttributionCount={pendingAttributionCount}
        />
        <SidebarInset>
          <AppHeader pendingAttributionCount={pendingAttributionCount} />
          <main className="flex-1 p-4 md:p-6">
            {counter && shiftOpenResult && (
              <ShiftAttributionBanner initialState={shiftOpenResult} />
            )}
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
