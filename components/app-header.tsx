"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { getPageTitle } from "@/lib/nav";
import { OfflineStatusHeader } from "@/components/offline-status";

interface AppHeaderProps {
  pendingAttributionCount?: number;
}

export function AppHeader({ pendingAttributionCount = 0 }: AppHeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const showReconcile =
    pendingAttributionCount > 0 &&
    (pathname === "/dashboard" || pathname === "/pazar");

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
      {showReconcile && (
        <Link
          href={`${pathname}?unassigned=1`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1">
            {pendingAttributionCount > 99 ? "99+" : pendingAttributionCount}
          </Badge>
          <span className="hidden sm:inline">Nedodeljene operacije</span>
        </Link>
      )}
      <OfflineStatusHeader />
      </div>
    </header>
  );
}
