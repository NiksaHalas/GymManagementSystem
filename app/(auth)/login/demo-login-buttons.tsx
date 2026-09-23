"use client";

import * as React from "react";
import { ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { demoSignInAction } from "./demo-actions";

const ROLES = [
  {
    role: "worker",
    label: "Isprobaj kao radnik",
    hint: "Counter: check-in, payments, keys",
    Icon: Store,
  },
  {
    role: "admin",
    label: "Isprobaj kao admin",
    hint: "Owner: takings, shifts, prices",
    Icon: ShieldCheck,
  },
] as const;

export function DemoLoginButtons() {
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function signIn(role: string) {
    setPending(role);
    setError(null);
    const result = await demoSignInAction(role);
    // Only reached on failure — success redirects.
    if (result?.error) {
      setError(result.error);
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Live demo — pick a role
        </span>
        <Separator className="flex-1" />
      </div>

      <div className="grid gap-2">
        {ROLES.map(({ role, label, hint, Icon }) => (
          <Button
            key={role}
            type="button"
            variant="outline"
            className="h-auto justify-start py-2"
            disabled={pending !== null}
            onClick={() => signIn(role)}
          >
            <Icon className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex flex-col items-start">
              <span>{pending === role ? "Prijavljivanje..." : label}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {hint}
              </span>
            </span>
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
