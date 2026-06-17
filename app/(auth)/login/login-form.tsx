"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn } from "lucide-react";
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
import { signInAction } from "./actions";

const schema = z.object({
  username: z.string().min(1, "Unesite korisničko ime."),
  password: z.string().min(1, "Unesite lozinku."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [showPassword, setShowPassword] = React.useState(false);

  // Show toasts for auth-related redirects
  React.useEffect(() => {
    const err = searchParams.get("error");
    if (err === "disabled") {
      toast.error("Nalog je deaktiviran. Kontaktirajte administratora.");
    } else if (err === "expired") {
      toast.error(
        "Link za reset lozinke je istekao ili je već iskorišćen. Zatražite novi.",
        {
          action: {
            label: "Zaboravljena lozinka",
            onClick: () => {
              window.location.href = "/zaboravljena-lozinka";
            },
          },
        },
      );
    } else if (err === "auth") {
      toast.error(
        "Prijava nije uspela — link je nevažeći ili istekao. Pokušajte ponovo ili zatražite novi link za reset lozinke.",
        {
          action: {
            label: "Zaboravljena lozinka",
            onClick: () => {
              window.location.href = "/zaboravljena-lozinka";
            },
          },
        },
      );
    }
  }, [searchParams]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    const fd = new FormData();
    fd.set("username", values.username);
    fd.set("password", values.password);
    fd.set("callbackUrl", callbackUrl);

    const result = await signInAction(fd);
    if (result?.error) {
      form.setError("root", { message: result.error });
    }
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lozinka</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-10"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
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
          {form.formState.isSubmitting ? (
            "Prijavljivanje..."
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              Prijavi se
            </>
          )}
        </Button>

        <div className="text-center text-sm">
          <Link
            href="/zaboravljena-lozinka"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Zaboravljena lozinka?
          </Link>
        </div>
      </form>
    </Form>
  );
}
