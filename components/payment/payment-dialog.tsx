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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPaymentCatalogAction,
  getPaymentContextAction,
  recordPayment,
} from "@/app/(app)/pazar/actions";
import { getMemberStatus } from "@/lib/members/status";
import { formatFullName, formatMemberNo, formatRsd, formatDate } from "@/lib/members/format";
import type { PaymentCatalog, PaymentContext } from "@/lib/pazar/types";
import type { CategoryWithTypes } from "@/lib/catalog/types";
import type { MembershipStartMode } from "@/lib/db/types";

interface PaymentDialogProps {
  memberId: string | null;
  checkinId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
}

export function PaymentDialog({
  memberId,
  checkinId = null,
  open,
  onOpenChange,
  onPaid,
}: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {memberId ? (
          <PaymentDialogForm
            key={memberId}
            memberId={memberId}
            checkinId={checkinId}
            onOpenChange={onOpenChange}
            onPaid={onPaid}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Naplata</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PaymentDialogFormProps {
  memberId: string;
  checkinId: string | null;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
}

function PaymentDialogForm({
  memberId,
  checkinId,
  onOpenChange,
  onPaid,
}: PaymentDialogFormProps) {
  const router = useRouter();
  const [ctx, setCtx] = React.useState<PaymentContext | null>(null);
  const [catalog, setCatalog] = React.useState<PaymentCatalog | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [typeId, setTypeId] = React.useState<string>("");
  const [useStandardPrice, setUseStandardPrice] = React.useState(false);
  const [customAmount, setCustomAmount] = React.useState("");
  const [customReason, setCustomReason] = React.useState("");
  const [startMode, setStartMode] = React.useState<MembershipStartMode>("payment");
  const [selectedDebts, setSelectedDebts] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [context, cat] = await Promise.all([
          getPaymentContextAction(memberId),
          getPaymentCatalogAction(),
        ]);
        if (cancelled) return;
        setCtx(context);
        setCatalog(cat);
        if (context) {
          setSelectedDebts(new Set(context.unsettledDebts.map((d) => d.id)));
        }
      } catch {
        if (!cancelled) toast.error("Greška pri učitavanju podataka.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const selectedCategory: CategoryWithTypes | null =
    catalog?.categories.find((c) => String(c.id) === categoryId) ?? null;

  const selectedType =
    selectedCategory?.types.find((t) => String(t.id) === typeId) ?? null;

  const categoryCode = selectedCategory?.code ?? "";
  const hasDiscount =
    ctx?.discountFlag &&
    categoryCode === "otvoreni" &&
    selectedType?.discount != null;

  const standardPrice = selectedType?.standard?.amount_rsd ?? null;
  const discountPrice = selectedType?.discount?.amount_rsd ?? null;
  const offeredPrice =
    hasDiscount && !useStandardPrice
      ? (discountPrice ?? standardPrice)
      : standardPrice;

  const parsedCustom = customAmount.trim() === "" ? null : parseInt(customAmount, 10);
  const isCustom =
    parsedCustom != null &&
    !Number.isNaN(parsedCustom) &&
    offeredPrice != null &&
    parsedCustom < offeredPrice;
  const effectiveAmount = isCustom ? parsedCustom : (offeredPrice ?? 0);

  const debtTotal = ctx
    ? ctx.unsettledDebts
        .filter((d) => selectedDebts.has(d.id))
        .reduce((s, d) => s + d.amountRsd, 0)
    : 0;

  const membershipSelected = typeId !== "";
  const canSubmit =
    membershipSelected || selectedDebts.size > 0;

  async function doSubmit() {
    if (!ctx) return;

    if (!canSubmit) {
      toast.error("Izaberite članarinu ili dug za izmirenje.");
      return;
    }

    if (membershipSelected) {
      if (offeredPrice == null) {
        toast.error("Nema aktivne cene za izabrani paket.");
        return;
      }
      if (isCustom && (parsedCustom == null || parsedCustom <= 0)) {
        toast.error("Unesite ispravan iznos.");
        return;
      }
    }

    setPending(true);
    try {
      const res = await recordPayment({
        memberId,
        membershipTypeId: membershipSelected ? parseInt(typeId, 10) : null,
        amountRsd: membershipSelected ? effectiveAmount : 0,
        isCustomPrice: membershipSelected && isCustom,
        customReason: isCustom ? customReason.trim() || null : null,
        startMode: ctx.hasActiveMembership ? "payment" : startMode,
        settleReservedIds: [...selectedDebts],
        checkinId,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      if (res.scheduled) {
        toast.success("Zakazana članarina kreirana.");
      } else {
        toast.success("Uplata je zabeležena.");
      }

      onOpenChange(false);
      onPaid?.();
      router.refresh();
    } finally {
      setPending(false);
      setConfirmOpen(false);
    }
  }

  function requestSubmit() {
    if (isCustom) {
      setConfirmOpen(true);
      return;
    }
    void doSubmit();
  }

  const status = getMemberStatus(ctx?.currentMembership ?? null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Naplata</DialogTitle>
        {ctx && (
          <DialogDescription>
            {formatFullName(ctx.firstName, ctx.lastName)} ·{" "}
            {formatMemberNo(ctx.memberNo)}
          </DialogDescription>
        )}
      </DialogHeader>

      {loading && (
        <p className="text-muted-foreground text-sm">Učitavanje…</p>
      )}

      {ctx && !loading && (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-1">{status.label}</span>
            {ctx.scheduledMemberships.length > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-400">
                {ctx.scheduledMemberships.length} zakazana članarina
              </span>
            )}
          </div>

          {ctx.unsettledDebts.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-sm font-medium">Neizmireni dugovi</Label>
              {ctx.unsettledDebts.map((d) => (
                <div key={d.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`debt-${d.id}`}
                    checked={selectedDebts.has(d.id)}
                    onCheckedChange={(v) => {
                      setSelectedDebts((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      });
                    }}
                  />
                  <Label htmlFor={`debt-${d.id}`} className="text-sm font-normal leading-snug">
                    {formatDate(d.sessionDate)} · {d.trainingCategoryLabel} ·{" "}
                    {formatRsd(d.amountRsd)}
                  </Label>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-sm font-medium">Članarina (opciono)</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v);
                setTypeId("");
                setUseStandardPrice(false);
                setCustomAmount("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kategorija" />
              </SelectTrigger>
              <SelectContent>
                {catalog?.categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedCategory && (
              <Select
                value={typeId}
                onValueChange={(v) => {
                  setTypeId(v);
                  setCustomAmount("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Paket" />
                </SelectTrigger>
                <SelectContent>
                  {selectedCategory.types.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedType && offeredPrice != null && (
              <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                <p>
                  Ponuđena cena:{" "}
                  <span className="font-medium">{formatRsd(offeredPrice)}</span>
                </p>
                {hasDiscount && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="standard-price"
                      checked={useStandardPrice}
                      onCheckedChange={(v) => setUseStandardPrice(v === true)}
                    />
                    <Label htmlFor="standard-price" className="font-normal">
                      Standardna cena ({formatRsd(standardPrice!)})
                    </Label>
                  </div>
                )}
                <div>
                  <Label htmlFor="custom-amount" className="text-xs">
                    Prilagođeni iznos (opciono, niži)
                  </Label>
                  <Input
                    id="custom-amount"
                    type="number"
                    min={1}
                    max={offeredPrice - 1}
                    placeholder={String(offeredPrice)}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="mt-1"
                  />
                </div>
                {isCustom && (
                  <div>
                    <Label htmlFor="custom-reason" className="text-xs">
                      Razlog popusta (opciono)
                    </Label>
                    <Input
                      id="custom-reason"
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}

            {!ctx.hasActiveMembership && membershipSelected && (
              <div className="space-y-2">
                <Label className="text-sm">Početak članarine</Label>
                <Select
                  value={startMode}
                  onValueChange={(v) => setStartMode(v as MembershipStartMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">Od uplate (danas)</SelectItem>
                    <SelectItem value="first_visit">Od prvog dolaska</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {(membershipSelected || debtTotal > 0) && (
            <p className="text-sm font-medium">
              Ukupno:{" "}
              {formatRsd(
                (membershipSelected ? effectiveAmount : 0) + debtTotal,
              )}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Otkaži
        </Button>
        <Button
          type="button"
          onClick={requestSubmit}
          disabled={pending || loading || !ctx || !canSubmit}
        >
          {pending ? "Snimanje…" : "Naplati"}
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potvrda popusta</AlertDialogTitle>
            <AlertDialogDescription>
              Sigurno popust za{" "}
              {ctx ? formatFullName(ctx.firstName, ctx.lastName) : "člana"}? Iznos:{" "}
              {formatRsd(effectiveAmount)} (ponuđeno: {formatRsd(offeredPrice ?? 0)}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSubmit()}>
              Potvrdi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
