"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Mail, UserX, UserCheck, RefreshCw, Shield, User } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditEmailDialog } from "./edit-email-dialog";
import type { Staff } from "@/lib/db/types";

interface AccountsTableProps {
  staff: Staff[];
}

async function callAccountsApi(body: object) {
  const res = await fetch("/api/admin/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Greška.");
  return json;
}

export function AccountsTable({ staff }: AccountsTableProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [editEmailFor, setEditEmailFor] = React.useState<Staff | null>(null);

  const activeAdminCount = staff.filter(
    (s) => s.role === "admin" && s.active,
  ).length;

  function isLastActiveAdmin(s: Staff): boolean {
    return s.role === "admin" && s.active && activeAdminCount <= 1;
  }

  async function handle(
    action: string,
    staffId: string,
    extra?: object,
  ) {
    setPending(`${action}:${staffId}`);
    try {
      await callAccountsApi({ action, staff_id: staffId, ...extra });
      toast.success("Uspešno.");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Greška.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Korisničko ime</TableHead>
              <TableHead>Uloga</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Email za oporavak</TableHead>
              <TableHead className="text-right">Akcije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nema naloga.
                </TableCell>
              </TableRow>
            )}
            {staff.map((s) => (
              <TableRow key={s.id} className={!s.active ? "opacity-60" : ""}>
                <TableCell className="font-medium">{s.username}</TableCell>
                <TableCell>
                  <Badge variant={s.role === "admin" ? "default" : "secondary"}>
                    {s.role === "admin" ? "Admin" : "Radnik"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={s.active ? "outline" : "destructive"}>
                    {s.active ? "Aktivan" : "Deaktiviran"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.recovery_email ?? (
                    <span className="italic">nije podešen</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending !== null}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>Akcije</DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() => setEditEmailFor(s)}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Podesi email za oporavak
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() =>
                          handle("reset_password", s.id)
                        }
                        disabled={!s.recovery_email}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Resetuj lozinku
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() =>
                          handle("set_role", s.id, {
                            role: s.role === "admin" ? "user" : "admin",
                          })
                        }
                        disabled={isLastActiveAdmin(s) && s.role === "admin"}
                      >
                        {s.role === "admin" ? (
                          <>
                            <User className="mr-2 h-4 w-4" />
                            Postavi kao radnik
                          </>
                        ) : (
                          <>
                            <Shield className="mr-2 h-4 w-4" />
                            Postavi kao admin
                          </>
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {s.active ? (
                        <DropdownMenuItem
                          onClick={() => handle("disable", s.id)}
                          disabled={isLastActiveAdmin(s)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserX className="mr-2 h-4 w-4" />
                          Deaktiviraj nalog
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handle("enable", s.id)}
                        >
                          <UserCheck className="mr-2 h-4 w-4" />
                          Aktiviraj nalog
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditEmailDialog
        staff={editEmailFor}
        onClose={() => setEditEmailFor(null)}
        onSaved={() => {
          setEditEmailFor(null);
          router.refresh();
        }}
      />
    </>
  );
}
