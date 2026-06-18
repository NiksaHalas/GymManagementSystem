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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createMemberCheckin,
  getMemberCheckinContext,
} from "@/app/(app)/(shell)/dashboard/actions";
import type { CheckinMemberContext, StaffOption } from "@/lib/dashboard/types";
import { KEY_COUNT } from "@/lib/dashboard/types";
import { formatFullName, formatMemberNo } from "@/lib/members/format";
import { cn } from "@/lib/utils";

const RESERVED_WARN_THRESHOLD = 3;

interface CheckinDialogProps {
  memberId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffOptions: StaffOption[];
  occupiedOpenKeys: number[];
  onPayMembership?: () => void;
  paymentRefreshKey?: number;
}

export function CheckinDialog({
  memberId,
  open,
  onOpenChange,
  staffOptions,
  occupiedOpenKeys,
  onPayMembership,
  paymentRefreshKey = 0,
}: CheckinDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {memberId ? (
          <CheckinDialogForm
            key={memberId}
            memberId={memberId}
            onOpenChange={onOpenChange}
            staffOptions={staffOptions}
            occupiedOpenKeys={occupiedOpenKeys}
            onPayMembership={onPayMembership}
            paymentRefreshKey={paymentRefreshKey}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Prijava dolaska</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CheckinDialogFormProps {
  memberId: string;
  onOpenChange: (open: boolean) => void;
  staffOptions: StaffOption[];
  occupiedOpenKeys: number[];
  onPayMembership?: () => void;
  paymentRefreshKey?: number;
}

function CheckinDialogForm({
  memberId,
  onOpenChange,
  staffOptions,
  occupiedOpenKeys,
  onPayMembership,
  paymentRefreshKey = 0,
}: CheckinDialogFormProps) {
  const router = useRouter();
  const [ctx, setCtx] = React.useState<CheckinMemberContext | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [keyNo, setKeyNo] = React.useState<number | null>(null);
  const [noKey, setNoKey] = React.useState(false);
  const [withTrainer, setWithTrainer] = React.useState(false);
  const [trainerId, setTrainerId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [commentAckOpen, setCommentAckOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getMemberCheckinContext(memberId)
      .then((data) => {
        if (!cancelled) setCtx(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Greška pri učitavanju člana.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, paymentRefreshKey]);

  const allKeysTaken = occupiedOpenKeys.length >= KEY_COUNT;

  function requestSubmit() {
    if (!ctx) return;
    if (ctx.comment?.trim()) {
      setCommentAckOpen(true);
      return;
    }
    void doSubmit();
  }

  async function doSubmit() {
    if (!ctx) return;

    if (!noKey && keyNo == null) {
      toast.error("Izaberite ključ ili označite „Bez ključa“.");
      return;
    }

    if (withTrainer && !trainerId) {
      toast.error("Izaberite trenera.");
      return;
    }

    if (noKey && !allKeysTaken) {
      toast.error("Svi ključevi nisu zauzeti — izaberite ključ.");
      return;
    }

    setPending(true);
    try {
      const res = await createMemberCheckin({
        memberId,
        keyNo: noKey ? null : keyNo,
        withTrainer: ctx.isTrainerBased && withTrainer,
        trainingCategoryId:
          ctx.isTrainerBased && withTrainer ? ctx.trainingCategoryId : null,
        trainerId: ctx.isTrainerBased && withTrainer ? trainerId : null,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      if (res.reserved) {
        toast.warning(
          "Sesija je rezervisana (dužan termin) — naplatiti pri sledećoj uplati.",
        );
      } else {
        toast.success("Dolazak je zabeležen.");
      }

      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
      setCommentAckOpen(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Prijava dolaska</DialogTitle>
        {ctx && (
          <DialogDescription>
            {formatFullName(ctx.firstName, ctx.lastName)} ·{" "}
            {formatMemberNo(ctx.memberNo)}
            {ctx.membershipLabel ? ` · ${ctx.membershipLabel}` : ""}
          </DialogDescription>
        )}
      </DialogHeader>

      {loading && (
        <p className="text-muted-foreground text-sm">Učitavanje…</p>
      )}

      {ctx && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-1">
              {ctx.membershipStatusLabel}
            </span>
            {ctx.sessionsLeft != null && !ctx.isTimeBased && (
              <span className="rounded-md bg-muted px-2 py-1">
                Preostalo: {ctx.sessionsLeft} sesija
              </span>
            )}
            {ctx.unsettledReservedCount > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-400">
                Dužnih termina: {ctx.unsettledReservedCount}
              </span>
            )}
          </div>

          <div>
            <Label className="mb-2 block text-sm">Ključ</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: KEY_COUNT }, (_, i) => i + 1).map((n) => {
                const occupied = occupiedOpenKeys.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={noKey}
                    onClick={() => setKeyNo(n)}
                    className={cn(
                      "h-8 rounded-md text-xs font-medium border",
                      keyNo === n && "ring-2 ring-primary",
                      occupied
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted/50 hover:bg-muted",
                      noKey && "opacity-50",
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                id="no-key"
                checked={noKey}
                onCheckedChange={(v) => {
                  setNoKey(v === true);
                  if (v) setKeyNo(null);
                }}
                disabled={!allKeysTaken}
              />
              <Label htmlFor="no-key" className="text-sm font-normal">
                Bez ključa
                {allKeysTaken && (
                  <span className="text-destructive ml-1">
                    (svi ključevi zauzeti)
                  </span>
                )}
              </Label>
            </div>
          </div>

          {ctx.isTrainerBased && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="with-trainer"
                  checked={withTrainer}
                  onCheckedChange={(v) => setWithTrainer(v === true)}
                />
                <Label htmlFor="with-trainer" className="text-sm font-normal">
                  Sa trenerom ({ctx.trainingCategoryLabel})
                </Label>
              </div>
              {withTrainer && (
                <>
                  <Select value={trainerId} onValueChange={setTrainerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Izaberite trenera" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(ctx.sessionsLeft ?? 0) <= 0 && (
                    <p className="text-amber-600 dark:text-amber-400 text-xs">
                      Nema preostalih sesija — biće rezervisano kao dužan termin.
                      {ctx.unsettledReservedCount >= RESERVED_WARN_THRESHOLD &&
                        " Upozorenje: već ima 3+ neizmirenih termina."}
                    </p>
                  )}
                </>
              )}
              {!withTrainer && (
                <p className="text-muted-foreground text-xs">
                  Član trenira samostalno — sesija se ne oduzima.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
        {onPayMembership && (
          <Button
            type="button"
            variant="secondary"
            onClick={onPayMembership}
            disabled={pending || loading || !ctx}
          >
            Naplati članarinu
          </Button>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button
            type="button"
            onClick={requestSubmit}
            disabled={pending || loading || !ctx}
          >
            {pending ? "Snimanje…" : "Potvrdi dolazak"}
          </Button>
        </div>
      </DialogFooter>

      <AlertDialog open={commentAckOpen} onOpenChange={setCommentAckOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Napomena o članu</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {ctx?.comment}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSubmit()}>
              Razumem, nastavi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
