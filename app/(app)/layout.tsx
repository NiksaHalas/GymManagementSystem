import { requireUser } from "@/lib/auth/session";
import { isCounterDevice } from "@/lib/auth/counter";
import { ensureOpenShift } from "@/lib/shifts/actions";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar staff={staff} isCounter={counter} />
        <SidebarInset>
          <AppHeader />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
