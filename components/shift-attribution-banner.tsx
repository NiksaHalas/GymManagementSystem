"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  openOrResumeShift,
  type ShiftOpenResult,
} from "@/lib/shifts/actions";
import { TakeoverShiftDialog } from "@/components/takeover-shift-dialog";

interface ShiftAttributionBannerProps {
  initialState: ShiftOpenResult;
}

export function ShiftAttributionBanner({
  initialState,
}: ShiftAttributionBannerProps) {
  const router = useRouter();
  const [state, setState] = React.useState(initialState);
  const [retrying, setRetrying] = React.useState(false);
  const [takeoverOpen, setTakeoverOpen] = React.useState(false);

  const visible =
    state.status === "foreign_shift_open" ||
    (state.status === "error" && !state.transient);

  if (!visible) return null;

  async function handleRetry() {
    setRetrying(true);
    try {
      const result = await openOrResumeShift();
      setState(result);
      if (result.status === "ok") {
        toast.success("Smena je otvorena.");
        router.refresh();
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    } finally {
      setRetrying(false);
    }
  }

  function handleTakeoverSuccess() {
    setState({ status: "ok" });
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="font-medium">Smena nije otvorena</p>
              <p className="mt-1">
                Beležim operacije kao <strong>unassigned</strong> dok se smena
                ne otvori ili ne preuzme.
                {state.status === "error" && (
                  <span className="mt-1 block text-xs opacity-80">
                    {state.message}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={retrying}
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
                />
                {retrying ? "Pokušavam..." : "Pokušaj ponovo"}
              </Button>
              {state.status === "foreign_shift_open" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setTakeoverOpen(true)}
                >
                  Preuzmi smenu
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <TakeoverShiftDialog
        open={takeoverOpen}
        onOpenChange={setTakeoverOpen}
        onSuccess={handleTakeoverSuccess}
      />
    </>
  );
}
