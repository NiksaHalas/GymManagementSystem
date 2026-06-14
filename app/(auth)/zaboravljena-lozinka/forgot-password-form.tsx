"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { requestPasswordResetAction } from "./actions";

const schema = z.object({
  username: z.string().min(1, "Unesite korisničko ime."),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  });

  async function onSubmit(values: FormValues) {
    await requestPasswordResetAction(values.username);
    // Always show success to prevent user enumeration
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center text-sm">
        <p className="text-muted-foreground">
          Ako postoji nalog sa tim korisničkim imenom i registrovanim email-om za
          oporavak, link za resetovanje je poslat.
        </p>
        <Link
          href="/login"
          className="text-primary underline-offset-4 hover:underline"
        >
          Nazad na prijavu
        </Link>
      </div>
    );
  }

  return (
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
                  autoComplete="username"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Slanje..." : "Pošalji link"}
        </Button>

        <div className="text-center text-sm">
          <Link
            href="/login"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Nazad na prijavu
          </Link>
        </div>
      </form>
    </Form>
  );
}
