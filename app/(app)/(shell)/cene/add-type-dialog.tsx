"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import type { TrainingCategory } from "@/lib/db/types";
import { createMembershipType } from "./actions";

const NEW_CATEGORY = "__new__";

const formSchema = z
  .object({
    categoryMode: z.string(),
    training_category_id: z.string().optional(),
    new_category_label: z.string().optional(),
    new_category_trainer: z.boolean(),
    new_category_per_trainee: z.boolean(),
    package: z.string().min(1, "Unesite paket."),
    label: z.string().min(1, "Unesite naziv."),
    is_time_based: z.boolean(),
    sessions: z.string().optional(),
    standard_price_rsd: z.string().min(1, "Unesite standardnu cenu."),
    discount_price_rsd: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.categoryMode === NEW_CATEGORY) {
      if (!v.new_category_label?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Unesite naziv nove kategorije.",
          path: ["new_category_label"],
        });
      }
    } else if (!v.training_category_id) {
      ctx.addIssue({
        code: "custom",
        message: "Izaberite kategoriju.",
        path: ["training_category_id"],
      });
    }
    if (!v.is_time_based) {
      const sessions = Number.parseInt(v.sessions ?? "", 10);
      if (!Number.isInteger(sessions) || sessions <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Broj termina je obavezan.",
          path: ["sessions"],
        });
      }
    }
    const std = Number.parseInt(v.standard_price_rsd, 10);
    if (!Number.isInteger(std) || std <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Standardna cena mora biti pozitivan ceo broj.",
        path: ["standard_price_rsd"],
      });
    }
    if (v.discount_price_rsd?.trim()) {
      const disc = Number.parseInt(v.discount_price_rsd, 10);
      if (!Number.isInteger(disc) || disc <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Cena sa popustom mora biti pozitivan ceo broj.",
          path: ["discount_price_rsd"],
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface AddTypeDialogProps {
  categories: TrainingCategory[];
}

export function AddTypeDialog({ categories }: AddTypeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      categoryMode: categories[0] ? String(categories[0].id) : NEW_CATEGORY,
      training_category_id: categories[0] ? String(categories[0].id) : undefined,
      new_category_label: "",
      new_category_trainer: false,
      new_category_per_trainee: false,
      package: "",
      label: "",
      is_time_based: false,
      sessions: "",
      standard_price_rsd: "",
      discount_price_rsd: "",
    },
  });

  const categoryMode = form.watch("categoryMode");
  const isTimeBased = form.watch("is_time_based");
  const selectedCategory =
    categoryMode === NEW_CATEGORY
      ? null
      : categories.find((c) => String(c.id) === categoryMode);
  const showDiscount = selectedCategory?.code === "otvoreni";

  async function onSubmit(values: FormValues) {
    const payload = {
      training_category_id:
        values.categoryMode === NEW_CATEGORY
          ? undefined
          : Number.parseInt(values.categoryMode, 10),
      new_category:
        values.categoryMode === NEW_CATEGORY
          ? {
              label: values.new_category_label!.trim(),
              is_trainer_based: values.new_category_trainer,
              per_trainee: values.new_category_per_trainee,
            }
          : undefined,
      package: values.package.trim(),
      label: values.label.trim(),
      is_time_based: values.is_time_based,
      sessions: values.is_time_based
        ? null
        : Number.parseInt(values.sessions ?? "0", 10),
      standard_price_rsd: Number.parseInt(values.standard_price_rsd, 10),
      discount_price_rsd: values.discount_price_rsd?.trim()
        ? Number.parseInt(values.discount_price_rsd, 10)
        : null,
    };

    const result = await createMembershipType(payload);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }

    toast.success("Tip članarine je dodat.");
    form.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj tip članarine
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj tip članarine</DialogTitle>
          <DialogDescription>
            Kreirajte novi paket u katalogu sa standardnom cenom.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="categoryMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kategorija treninga</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue(
                        "training_category_id",
                        v === NEW_CATEGORY ? undefined : v,
                      );
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Izaberite kategoriju" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.label}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_CATEGORY}>Nova kategorija…</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {categoryMode === NEW_CATEGORY && (
              <>
                <FormField
                  control={form.control}
                  name="new_category_label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Naziv nove kategorije</FormLabel>
                      <FormControl>
                        <Input placeholder="npr. Grupni" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="new_category_trainer"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="cursor-pointer">
                        Zahteva trenera (oduzima termin)
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="new_category_per_trainee"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="cursor-pointer">
                        Cena po učesniku (duo)
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="package"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paket (kod)</FormLabel>
                    <FormControl>
                      <Input placeholder="8/1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naziv</FormLabel>
                    <FormControl>
                      <Input placeholder="Otvoreni tip 8/1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_time_based"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="cursor-pointer">
                    Mesečna (vremenska) članarina
                  </FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {!isTimeBased && (
              <FormField
                control={form.control}
                name="sessions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Broj termina</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="standard_price_rsd"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Standardna cena (RSD)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} step={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showDiscount && (
              <FormField
                control={form.control}
                name="discount_price_rsd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cena sa popustom (opciono, RSD)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                {form.formState.isSubmitting ? "Dodavanje..." : "Dodaj"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
