"use client";

import * as React from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "demo-banner-dismissed";

const TIPS = {
  counter: [
    "Search a member by surname and check them in (Kontrolna tabla)",
    "Take a membership payment with „Naplati“",
    "Mark someone as left („Otišao“) and watch their key free up",
  ],
  admin: [
    "Pazar: daily, monthly and yearly takings, with CSV export",
    "Smene: weekly shift history, handovers and coverage gaps",
    "Članovi: open a member card to see their full history",
  ],
};

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false; // storage unavailable (private mode) — keep the banner
  }
}

/**
 * English guide shown only in the public demo (DEMO_MODE). The UI itself stays
 * in Serbian, as built for the gym; this explains what to try and the key terms.
 */
export function DemoBanner({ isCounter }: { isCounter: boolean }) {
  const storedDismissed = React.useSyncExternalStore(subscribe, readDismissed, () => false);
  const [dismissedNow, setDismissedNow] = React.useState(false);

  function dismiss() {
    setDismissedNow(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (storedDismissed || dismissedNow) return null;

  const tips = isCounter ? TIPS.counter : TIPS.admin;

  return (
    <div className="mb-4 rounded-lg border bg-muted/50 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1 space-y-2">
          <p className="font-medium">
            Live demo: front-desk app for a family-run gym (UI in Serbian)
          </p>
          <p className="text-muted-foreground">
            {isCounter
              ? "You are signed in as a counter worker. Things to try:"
              : "You are signed in as the owner (Admin), viewing remotely. Check-ins and payments happen at the counter — sign in as Radnik for those. Things to try:"}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Kontrolna tabla = Dashboard · Članovi = Members · Pazar = Takings ·
            Smene = Shifts · Cene = Prices · Nalozi = Accounts. Changes you make
            are reset every night.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={dismiss}
          aria-label="Dismiss demo guide"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
