"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toggleDiscount, updateComment } from "../actions";

export function DiscountToggle({
  memberId,
  initial,
}: {
  memberId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  async function onChange(next: boolean) {
    setValue(next);
    setPending(true);
    const res = await toggleDiscount(memberId, next);
    setPending(false);
    if (!res.ok) {
      setValue(!next);
      toast.error(res.error);
      return;
    }
    toast.success("Sačuvano.");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="space-y-0.5">
        <Label htmlFor="discount-toggle">Popust (porodica / škola)</Label>
        <p className="text-sm text-muted-foreground">Primenjuje se samo na Otvoreni tip.</p>
      </div>
      <Switch
        id="discount-toggle"
        checked={value}
        disabled={pending}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function CommentEditor({
  memberId,
  initial,
}: {
  memberId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initial ?? "");
  const [saving, setSaving] = React.useState(false);
  const dirty = value.trim() !== (initial ?? "").trim();

  async function save() {
    setSaving(true);
    const res = await updateComment(memberId, value);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Komentar je sačuvan.");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="comment-editor">Komentar (posebne napomene)</Label>
      <Textarea
        id="comment-editor"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Nema komentara."
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? "Čuvanje…" : "Sačuvaj komentar"}
        </Button>
      </div>
    </div>
  );
}
