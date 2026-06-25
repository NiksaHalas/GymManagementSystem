"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { formatRsd } from "@/lib/members/format";
import { cn } from "@/lib/utils";

interface PriceCellProps {
  membershipTypeId: number;
  isDiscountPrice: boolean;
  amount: number | null;
  isAdmin: boolean;
  disabled?: boolean;
  onSave: (input: {
    membership_type_id: number;
    is_discount_price: boolean;
    amount_rsd: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function PriceCell({
  membershipTypeId,
  isDiscountPrice,
  amount,
  isAdmin,
  disabled,
  onSave,
}: PriceCellProps) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const canEdit = isAdmin && !disabled;

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    if (!canEdit) return;
    setValue(amount != null ? String(amount) : "");
    setEditing(true);
  }

  async function commit() {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error("Cena mora biti pozitivan ceo broj.");
      setEditing(false);
      return;
    }
    if (amount === parsed) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await onSave({
      membership_type_id: membershipTypeId,
      is_discount_price: isDiscountPrice,
      amount_rsd: parsed,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Cena je sačuvana.");
    setEditing(false);
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (!isAdmin) {
    return (
      <span className="tabular-nums">
        {amount != null ? formatRsd(amount) : "—"}
      </span>
    );
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={1}
        step={1}
        value={value}
        disabled={saving}
        className="h-8 w-28 tabular-nums"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit || saving}
      onClick={startEdit}
      className={cn(
        "tabular-nums text-left",
        canEdit && "cursor-pointer rounded px-1 hover:bg-muted",
        !canEdit && "cursor-default",
        amount == null && "text-muted-foreground",
      )}
      title={canEdit ? "Kliknite za izmenu" : undefined}
    >
      {amount != null ? formatRsd(amount) : "—"}
    </button>
  );
}
