import { redirect } from "next/navigation";
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
 * Main app shell with sidebar.
 * - Workers without counter cookie are redirected to /samo-salter.
 * - On counter, attempts open_or_resume_shift (fail-open; banner on foreign/error).
 */
export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireUser();
  const counter = await isCounterDevice();

  if (staff.role !== "admin" && !counter) {
    redirect("/samo-salter");
  }

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
