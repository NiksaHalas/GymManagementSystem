"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import { createClient } from "@/utils/supabase/client";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Lozinka mora imati najmanje 8 karaktera."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Lozinke se ne poklapaju.",
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const [done, setDone] = React.useState(false);

  /**
   * Supabase sends the recovery token as a URL fragment (#access_token=...).
   * When redirectTo lands on this page, @supabase/ssr automatically exchanges
   * the PKCE code in the URL and sets the session cookie.
   * We just need to call updateUser() with the new password.
   */
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      form.setError("root", {
        message:
          "Greška pri promeni lozinke. Link je možda istekao. Zatražite novi.",
      });
      return;
    }

    toast.success("Lozinka je uspešno promenjena.");
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (done) {
    return (
      <div className="text-center text-sm space-y-2">
        <p className="text-muted-foreground">
          Lozinka je promenjena. Preusmeravamo vas na prijavu...
        </p>
        <Link
          href="/login"
          className="text-primary underline-offset-4 hover:underline"
        >
          Prijava
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova lozinka</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="min. 8 karaktera"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Potvrda lozinke</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="ponovite lozinku"
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

        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Čuvanje..." : "Sačuvaj lozinku"}
        </Button>
      </form>
    </Form>
  );
}
