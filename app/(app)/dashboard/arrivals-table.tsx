"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, MoreHorizontal } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  markLeft,
  updateCheckinKey,
  voidCheckin,
} from "@/app/(app)/dashboard/actions";
import {
  formatCheckinDisplayName,
  formatPaymentBadge,
} from "@/lib/dashboard/format";
import { formatMemberNo } from "@/lib/members/format";
import type { DashboardCheckinRow } from "@/lib/dashboard/types";
import { KEY_COUNT } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

interface ArrivalsTableProps {
  rows: DashboardCheckinRow[];
  canOperate: boolean;
  occupiedOpenKeys: number[];
}

export function ArrivalsTable({
  rows,
  canOperate,
  occupiedOpenKeys,
}: ArrivalsTableProps) {
  const router = useRouter();
  const [keyDialog, setKeyDialog] = React.useState<DashboardCheckinRow | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<DashboardCheckinRow | null>(null);
  const [newKey, setNewKey] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleMarkLeft(id: string) {
    const res = await markLeft({ checkinId: id });
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Ključ je oslobođen.");
      router.refresh();
    }
  }

  async function handleUpdateKey() {
    if (!keyDialog) return;
    setPending(true);
    try {
      const res = await updateCheckinKey({
        checkinId: keyDialog.id,
        keyNo: newKey,
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Ključ je promenjen.");
        setKeyDialog(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget) return;
    setPending(true);
    try {
      const res = await voidCheckin({ checkinId: voidTarget.id });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Dolazak je poništen.");
        setVoidTarget(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nema dolazaka za izabrani dan.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Član</TableHead>
            <TableHead className="w-16">Ključ</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uplata</TableHead>
            {canOperate && <TableHead className="w-32 text-right">Akcije</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div>
                    {row.memberId ? (
                      <Link
                        href={`/clanovi/${row.memberId}`}
                        className="font-medium hover:underline"
                      >
                        {formatCheckinDisplayName(row)}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {formatCheckinDisplayName(row)}
                      </span>
                    )}
                    {row.memberNo != null && !row.isFitpass && (
                      <p className="text-muted-foreground text-xs">
                        {formatMemberNo(row.memberNo)}
                      </p>
                    )}
                  </div>
                  {row.comment && (
                    <MessageSquare
                      className="text-muted-foreground h-4 w-4 shrink-0"
                      aria-label="Ima komentar"
                    />
                  )}
                </div>
              </TableCell>
              <TableCell>
                {row.keyNo ?? "—"}
                {row.keyReturned && row.keyNo != null && (
                  <span className="text-muted-foreground ml-1 text-xs">(otišao)</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {row.membershipStatus === "expired" && !row.isFitpass && (
                    <Badge variant="destructive" className="text-xs">
                      Istekla članarina
                    </Badge>
                  )}
                  {row.withTrainer && (
                    <Badge variant="secondary" className="text-xs">
                      Trener
                      {row.trainerUsername ? `: ${row.trainerUsername}` : ""}
                    </Badge>
                  )}
                  {row.hasReservedDebt && (
                    <Badge variant="outline" className="text-xs text-amber-700">
                      Rezervisano
                    </Badge>
                  )}
                  {row.isGroupFitpass && (
                    <Badge variant="outline" className="text-xs">
                      Grupni Fitpass
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {formatPaymentBadge(row.paymentToday) && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {formatPaymentBadge(row.paymentToday)}
                  </Badge>
                )}
              </TableCell>
              {canOperate && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {row.keyNo != null && !row.keyReturned && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleMarkLeft(row.id)}
                      >
                        Otišao
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setKeyDialog(row);
                            setNewKey(row.keyNo);
                          }}
                        >
                          Promeni ključ
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setVoidTarget(row)}
                        >
                          Poništi dolazak
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={keyDialog != null}
        onOpenChange={(o) => !o && setKeyDialog(null)}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Promeni ključ</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: KEY_COUNT }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNewKey(n)}
                className={cn(
                  "h-8 rounded-md text-xs border",
                  newKey === n && "ring-2 ring-primary",
                  occupiedOpenKeys.includes(n) && newKey !== n
                    ? "bg-destructive/10"
                    : "bg-muted/50",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setKeyDialog(null)}>
              Otkaži
            </Button>
            <Button type="button" onClick={handleUpdateKey} disabled={pending}>
              Sačuvaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={voidTarget != null}
        onOpenChange={(o) => !o && setVoidTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poništiti dolazak?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova akcija poništava zapis dolaska
              {voidTarget && ` za ${formatCheckinDisplayName(voidTarget)}`}.
              {voidTarget?.decrementedSession &&
                " Oduzeta sesija će biti vraćena."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid} disabled={pending}>
              Poništi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
