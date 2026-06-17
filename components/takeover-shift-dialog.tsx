"use client";

import * as React from "react";
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
import { handoverShiftAction } from "@/lib/shifts/actions";

interface TakeoverShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TakeoverShiftDialog({
  open,
  onOpenChange,
  onSuccess,
}: TakeoverShiftDialogProps) {
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await handoverShiftAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Smena je preuzeta.");
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Preuzeti smenu?</AlertDialogTitle>
          <AlertDialogDescription>
            Trenutna otvorena smena drugog radnika biće zatvorena, a nova smena
            otvorena na vaše ime. Operacije će se od tada vezati za vašu smenu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Otkaži</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {pending ? "Preuzimam..." : "Preuzmi smenu"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
