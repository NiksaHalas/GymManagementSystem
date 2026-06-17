"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronsUpDown,
  LogOut,
  RefreshCw,
  Shield,
  UserCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SwitchWorkerDialog } from "@/components/switch-worker-dialog";
import { endShiftAction, signOutAction } from "@/lib/shifts/actions";
import {
  adminNavItems,
  isNavActive,
  mainNavItems,
} from "@/lib/nav";
import type { Staff } from "@/lib/db/types";

interface AppSidebarProps {
  staff: Staff;
  isCounter: boolean;
  pendingAttributionCount?: number;
}

export function AppSidebar({
  staff,
  isCounter,
  pendingAttributionCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [endShiftOpen, setEndShiftOpen] = React.useState(false);
  const [switchOpen, setSwitchOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleEndShift() {
    setPending(true);
    try {
      await endShiftAction();
      toast.success("Smena je završena.");
      router.refresh();
    } catch {
      toast.error("Greška pri završetku smene.");
    } finally {
      setPending(false);
      setEndShiftOpen(false);
    }
  }

  async function handleSignOut() {
    setPending(true);
    try {
      await signOutAction();
    } catch {
      toast.error("Greška pri odjavi.");
      setPending(false);
    }
  }

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/dashboard">
                  <Shield className="text-primary" />
                  <span className="font-semibold">Teretana</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigacija</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems.map((item) => {
                  const showBadge =
                    staff.role === "admin" &&
                    pendingAttributionCount > 0 &&
                    (item.href === "/dashboard" || item.href === "/pazar");

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isNavActive(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <Link
                          href={
                            showBadge
                              ? `${item.href}?unassigned=1`
                              : item.href
                          }
                        >
                          <item.icon />
                          <span>{item.label}</span>
                          {showBadge && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px]"
                            >
                              {pendingAttributionCount > 99
                                ? "99+"
                                : pendingAttributionCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {staff.role === "admin" && (
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isNavActive(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          {isCounter && (
            <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
              <Badge variant="secondary" className="w-full justify-center text-xs">
                Šalter
              </Badge>
            </div>
          )}

          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <UserCheck className="size-4" />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{staff.username}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {staff.role === "admin" ? "Admin" : "Radnik"}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="top"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel>Radnik</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isCounter && (
                    <>
                      <DropdownMenuItem onClick={() => setSwitchOpen(true)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Zameni radnika
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEndShiftOpen(true)}>
                        <Shield className="mr-2 h-4 w-4" />
                        Završi smenu
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Odjava
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <AlertDialog open={endShiftOpen} onOpenChange={setEndShiftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Završiti smenu?</AlertDialogTitle>
            <AlertDialogDescription>
              Smena će biti zabeležena kao završena. Ostajete prijavljeni u
              sistem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndShift} disabled={pending}>
              {pending ? "Završavam..." : "Završi smenu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SwitchWorkerDialog open={switchOpen} onOpenChange={setSwitchOpen} />
    </>
  );
}
