"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
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
import { MemberFormFields } from "./member-form-fields";
import { checkPhoneDuplicate, createMember, type DuplicatePhoneMatch } from "./actions";

const DEFAULT_VALUES: MemberFormValues = {
  first_name: "",
  last_name: "",
  phone: "",
  discount_flag: false,
  comment: "",
};

interface CreateMemberDialogProps {
  /** Controlled open state (optional — uncontrolled when omitted). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after successful create instead of navigating to card. */
  onCreated?: (memberId: string) => void;
  /** Navigate to member card after create (default true). */
  redirectToCard?: boolean;
  /** Custom trigger; omit for default button. Pass null to hide trigger. */
  trigger?: React.ReactNode | null;
}

export function CreateMemberDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCreated,
  redirectToCard = true,
  trigger,
}: CreateMemberDialogProps = {}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [duplicates, setDuplicates] = React.useState<DuplicatePhoneMatch[] | null>(null);
  const [pendingValues, setPendingValues] = React.useState<MemberFormValues | null>(null);

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  async function persist(values: MemberFormValues) {
    const res = await createMember(values);
    if (!res.ok) {
      form.setError("root", { message: res.error });
      return;
    }
    toast.success(`Član "${values.first_name} ${values.last_name}" je kreiran.`);
    form.reset(DEFAULT_VALUES);
    setOpen(false);

    if (onCreated) {
      onCreated(res.id);
    } else if (redirectToCard) {
      router.push(`/clanovi/${res.id}`);
    } else {
      router.refresh();
    }
  }

  async function onSubmit(values: MemberFormValues) {
    const matches = await checkPhoneDuplicate(values.phone);
    if (matches.length > 0) {
      setPendingValues(values);
      setDuplicates(matches);
      return;
    }
    await persist(values);
  }

  const defaultTrigger = (
    <Button>
      <UserPlus className="mr-2 h-4 w-4" />
      Novi član
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger !== null && (
          <DialogTrigger asChild>
            {trigger ?? defaultTrigger}
          </DialogTrigger>
        )}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novi član</DialogTitle>
            <DialogDescription>
              Unesite podatke novog člana. Broj člana se dodeljuje automatski.
            </DialogDescription>
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
