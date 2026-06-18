"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z
  .object({
    username: z
      .string()
      .min(3, "Najmanje 3 karaktera.")
      .regex(
        /^[a-z0-9._-]+$/,
        "Samo mala slova, cifre, tačka, crtica, donja crta.",
      ),
    password: z.string().min(8, "Najmanje 8 karaktera."),
    role: z.enum(["user", "admin"]),
    recovery_email: z
      .string()
      .email("Neispravan email.")
      .or(z.literal(""))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "admin" && !data.recovery_email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email za oporavak je obavezan za admin nalog.",
        path: ["recovery_email"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export function CreateAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmNoEmailOpen, setConfirmNoEmailOpen] = React.useState(false);
  const [pendingValues, setPendingValues] = React.useState<FormValues | null>(
    null,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
      role: "user",
      recovery_email: "",
    },
  });

  const role = form.watch("role");

  async function submitAccount(values: FormValues) {
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...values }),
    });
    const json = await res.json();
    if (!res.ok) {
      form.setError("root", { message: json.error ?? "Greška." });
      return;
    }
    toast.success(`Nalog "${values.username}" je kreiran.`);
    form.reset();
    setOpen(false);
    setConfirmNoEmailOpen(false);
    setPendingValues(null);
    router.refresh();
  }

  async function onSubmit(values: FormValues) {
    if (values.role === "user" && !values.recovery_email) {
      setPendingValues(values);
      setConfirmNoEmailOpen(true);
      return;
    }
    await submitAccount(values);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Novi nalog
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novi nalog radnika</DialogTitle>
            <DialogDescription>
              Kreirajte nalog za novog radnika. Admin postavlja lozinku direktno.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Korisničko ime</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="korisnik"
                        autoComplete="off"
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.value.toLowerCase())
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lozinka</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="min. 8 karaktera"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uloga</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="user">Radnik</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="recovery_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email za oporavak
                      {role === "admin" ? "" : " (opciono)"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="radnik@primer.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Otkaži
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Kreiranje..." : "Kreiraj nalog"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmNoEmailOpen} onOpenChange={setConfirmNoEmailOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nastavi bez recovery emaila?</AlertDialogTitle>
            <AlertDialogDescription>
              Radnik neće moći da resetuje lozinku samostalno dok Admin ne
              podesi email za oporavak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingValues(null);
              }}
            >
              Otkaži
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingValues) void submitAccount(pendingValues);
              }}
            >
              Nastavi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
