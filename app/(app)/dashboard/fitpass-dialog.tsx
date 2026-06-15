"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { createFitpassCheckin } from "@/app/(app)/dashboard/actions";
import { KEY_COUNT } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

interface FitpassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occupiedKeys: number[];
}

export function FitpassDialog({
  open,
  onOpenChange,
  occupiedKeys,
}: FitpassDialogProps) {
  const router = useRouter();
  const [keyNo, setKeyNo] = React.useState<number | null>(null);
  const [isGroup, setIsGroup] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setKeyNo(null);
      setIsGroup(false);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (keyNo == null) {
      toast.error("Izaberite ključ.");
      return;
    }
    setPending(true);
    try {
      const res = await createFitpassCheckin({
        keyNo,
        isGroupFitpass: isGroup,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isGroup
          ? "Fitpass grupni dolazak je zabeležen (uplata +300 kasnije)."
          : "Fitpass dolazak je zabeležen.",
      );
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fitpass</DialogTitle>
          <DialogDescription>
            Anonimni dolazak — obavezan je broj ključa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: KEY_COUNT }, (_, i) => i + 1).map((n) => {
            const occupied = occupiedKeys.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setKeyNo(n)}
                className={cn(
                  "h-9 rounded-md text-xs font-medium border",
                  keyNo === n && "ring-2 ring-primary",
                  occupied
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-muted/50 hover:bg-muted",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="fitpass-group"
            checked={isGroup}
            onCheckedChange={(v) => setIsGroup(v === true)}
          />
          <Label htmlFor="fitpass-group" className="text-sm font-normal">
            Grupni trening (+300 RSD — uplata kasnije)
          </Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending || keyNo == null}>
            {pending ? "Snimanje…" : "Potvrdi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
