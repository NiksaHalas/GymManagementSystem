"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { memberFormSchema, type MemberFormValues } from "@/lib/members/schema";
import { formatMemberNo } from "@/lib/members/format";
import { MemberFormFields } from "../member-form-fields";
import {
  checkPhoneDuplicate,
  updateMember,
  type DuplicatePhoneMatch,
} from "../actions";

interface EditMemberDialogProps {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    discount_flag: boolean;
    comment: string | null;
  };
}

export function EditMemberDialog({ member }: EditMemberDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [duplicates, setDuplicates] = React.useState<DuplicatePhoneMatch[] | null>(null);
  const [pendingValues, setPendingValues] = React.useState<MemberFormValues | null>(null);

  const defaults: MemberFormValues = {
    first_name: member.first_name,
    last_name: member.last_name,
    phone: member.phone,
    discount_flag: member.discount_flag,
    comment: member.comment ?? "",
  };

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: defaults,
  });

  React.useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function persist(values: MemberFormValues) {
    const res = await updateMember(member.id, values);
    if (!res.ok) {
      form.setError("root", { message: res.error });
      return;
    }
    toast.success("Izmene su sačuvane.");
    setOpen(false);
    router.refresh();
  }

  async function onSubmit(values: MemberFormValues) {
    const matches = (await checkPhoneDuplicate(values.phone)).filter(
      (m) => m.id !== member.id,
    );
    if (matches.length > 0) {
      setPendingValues(values);
      setDuplicates(matches);
      return;
    }
    await persist(values);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Izmeni
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Izmena člana</DialogTitle>
            <DialogDescription>Ažurirajte podatke člana.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <MemberFormFields form={form} />

              {form.formState.errors.root && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Otkaži
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Čuvanje…" : "Sačuvaj"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={duplicates !== null}
        onOpenChange={(o) => {
          if (!o) setDuplicates(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Već postoji član sa tim brojem</AlertDialogTitle>
            <AlertDialogDescription>
              Broj telefona već koriste:
              {" "}
              {(duplicates ?? [])
                .map(
                  (m) =>
                    `${m.first_name} ${m.last_name} (br. ${formatMemberNo(m.member_no)})`,
                )
                .join(", ")}
              . Porodica može deliti broj — možete svejedno nastaviti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const values = pendingValues;
                setDuplicates(null);
                setPendingValues(null);
                if (values) await persist(values);
              }}
            >
              Svejedno sačuvaj
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
