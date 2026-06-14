"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, RefreshCw, UserCheck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import type { Staff } from "@/lib/db/types";

interface AppTopBarProps {
  staff: Staff;
  isCounter: boolean;
}

export function AppTopBar({ staff, isCounter }: AppTopBarProps) {
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
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center gap-4 px-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5 text-primary" />
          <span>Teretana</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">Dashboard</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/clanovi">Članovi</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/cene">Cene</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pazar">Pazar</Link>
          </Button>
          {staff.role === "admin" && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/smene">Smene</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/nalozi">Nalozi</Link>
              </Button>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isCounter && (
            <Badge variant="secondary" className="text-xs">
              Šalter
            </Badge>
          )}

          <Separator orientation="vertical" className="h-6" />

          {/* Worker menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <UserCheck className="h-4 w-4" />
                <span className="font-medium">{staff.username}</span>
                {staff.role === "admin" && (
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    Admin
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
        </div>
      </div>

      {/* End shift confirmation */}
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
            <AlertDialogAction
              onClick={handleEndShift}
              disabled={pending}
            >
              {pending ? "Završavam..." : "Završi smenu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Switch worker dialog */}
      <SwitchWorkerDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
      />
    </header>
  );
}
