"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Staff } from "@/lib/db/types";

const schema = z.object({
  recovery_email: z.string().email("Unesite ispravan email."),
});

type FormValues = z.infer<typeof schema>;

interface EditEmailDialogProps {
  staff: Staff | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditEmailDialog({
  staff,
  onClose,
  onSaved,
}: EditEmailDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { recovery_email: "" },
  });

  React.useEffect(() => {
    if (staff) {
      form.reset({ recovery_email: staff.recovery_email ?? "" });
    }
  }, [staff, form]);

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_recovery_email",
        staff_id: staff!.id,
        recovery_email: values.recovery_email,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      form.setError("root", { message: json.error ?? "Greška." });
      return;
    }
    toast.success("Email za oporavak je sačuvan.");
    onSaved();
  }

  return (
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Email za oporavak</DialogTitle>
          <DialogDescription>
            Podešava email na koji će biti poslat link za resetovanje lozinke
            za radnika{" "}
            <strong>{staff?.username}</strong>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="recovery_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email adresa</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="radnik@primer.com"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && (
              <p className="text-sm font-medium text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Otkaži
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Čuvanje..." : "Sačuvaj"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
