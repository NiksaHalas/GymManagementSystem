"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editPayment, voidPayment } from "@/app/(app)/pazar/actions";
import type { PaymentRow } from "@/lib/pazar/types";

interface PaymentRowActionsProps {
  row: PaymentRow;
  canEdit: boolean;
}

export function PaymentRowActions({ row, canEdit }: PaymentRowActionsProps) {
  const router = useRouter();
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState(String(row.amountRsd));
  const [editReason, setEditReason] = React.useState(row.customReason ?? "");
  const [pending, setPending] = React.useState(false);

  if (row.voided || !canEdit) return null;

  async function handleVoid() {
    setPending(true);
    try {
      const res = await voidPayment({ paymentId: row.id, reason });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Uplata je stornirana.");
        setVoidOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function handleEdit() {
    const parsed = parseInt(amount, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      toast.error("Unesite ispravan iznos.");
      return;
    }
    setPending(true);
    try {
      const res = await editPayment({
        paymentId: row.id,
        amountRsd: parsed,
        customReason: editReason.trim() || null,
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Uplata je izmenjena.");
        setEditOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        {row.kind === "membership" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAmount(String(row.amountRsd));
              setEditReason(row.customReason ?? "");
              setEditOpen(true);
            }}
          >
            Izmeni
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            setReason("");
            setVoidOpen(true);
          }}
        >
          Storno
        </Button>
      </div>

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stornirati uplatu?</AlertDialogTitle>
            <AlertDialogDescription>
              Razlog storna je obavezan. Ova akcija poništava uplatu od{" "}
              {row.label} ({row.amountRsd} RSD).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor={`void-reason-${row.id}`}>Razlog</Label>
            <Input
              id={`void-reason-${row.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!reason.trim()) {
                  toast.error("Razlog je obavezan.");
                  return;
                }
                void handleVoid();
              }}
              disabled={pending}
            >
              Storniraj
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Izmena uplate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`edit-amount-${row.id}`}>Iznos (RSD)</Label>
              <Input
                id={`edit-amount-${row.id}`}
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor={`edit-reason-${row.id}`}>Razlog (opciono)</Label>
              <Input
                id={`edit-reason-${row.id}`}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Otkaži
            </Button>
            <Button type="button" onClick={() => void handleEdit()} disabled={pending}>
              Sačuvaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
