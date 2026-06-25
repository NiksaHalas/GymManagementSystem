"use client";

import * as React from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useOfflineSync, useOfflineEnabled } from "@/lib/offline/use-offline-sync";
import { removePending } from "@/lib/offline/outbox";
import { refreshOfflineCache } from "@/lib/offline/cache";
import type { OutboxIntent } from "@/lib/offline/types";

type OfflineContextValue = {
  staffId: string;
  isCounter: boolean;
  canOperate: boolean;
  enabled: boolean;
  online: boolean;
  pendingCount: number;
  intents: OutboxIntent[];
  drainNow: () => Promise<void>;
  refreshCounts: () => Promise<void>;
};

const OfflineContext = React.createContext<OfflineContextValue>({
  staffId: "",
  isCounter: false,
  canOperate: false,
  enabled: false,
  online: true,
  pendingCount: 0,
  intents: [],
  drainNow: async () => {},
  refreshCounts: async () => {},
});

export function useOfflineContext() {
  return React.useContext(OfflineContext);
}

export function OfflineShellProvider({
  staffId,
  isCounter,
  canOperate,
  children,
}: {
  staffId: string;
  isCounter: boolean;
  canOperate: boolean;
  children: React.ReactNode;
}) {
  const featureEnabled = useOfflineEnabled();
  const enabled = featureEnabled && isCounter && canOperate;
  const sync = useOfflineSync(enabled);

  React.useEffect(() => {
    if (!enabled || !sync.online) return;
    void refreshOfflineCache();
    const interval = setInterval(() => void refreshOfflineCache(), 5 * 60_000);
    return () => clearInterval(interval);
  }, [enabled, sync.online]);

  const value = React.useMemo(
    () => ({
      staffId,
      isCounter,
      canOperate,
      enabled: featureEnabled && isCounter,
      online: sync.online,
      pendingCount: sync.pendingCount,
      intents: sync.intents,
      drainNow: sync.drainNow,
      refreshCounts: sync.refreshCounts,
    }),
    [staffId, isCounter, canOperate, featureEnabled, sync],
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

const INTENT_LABELS: Record<string, string> = {
  checkin_member: "Prijava dolaska",
  checkin_fitpass: "Fitpass dolazak",
  record_payment: "Naplata",
  mark_left: "Otišao",
  update_checkin_key: "Promena ključa",
};

export function OfflineStatusHeader() {
  const { enabled, online, pendingCount, intents, drainNow, refreshCounts } =
    useOfflineContext();
  const [open, setOpen] = React.useState(false);

  if (!enabled) return null;

  const failedCount = intents.filter((i) => i.status === "failed").length;
  const showBadge = pendingCount > 0 || failedCount > 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"
        title={online ? "Na mreži" : "Van mreže"}
      >
        {online ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-amber-600" />
        )}
        {online ? "Na mreži" : "Van mreže"}
      </span>

      {showBadge ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Badge
                variant={failedCount > 0 ? "destructive" : "secondary"}
                className="h-5 min-w-5 justify-center px-1"
              >
                {pendingCount + failedCount}
              </Badge>
              <span className="hidden sm:inline">Na čekanju ({pendingCount})</span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Offline red čekanja</SheetTitle>
              <SheetDescription>
                Operacije se šalju na server kada se veza uspostavi.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {intents.length === 0 && (
                <p className="text-muted-foreground text-sm">Nema stavki u redu.</p>
              )}
              {intents.map((intent) => (
                <div
                  key={intent.id}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {INTENT_LABELS[intent.type] ?? intent.type}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {intent.status === "failed"
                          ? `Neuspešno: ${intent.error ?? "greška"}`
                          : "Čeka sync"}
                      </p>
                    </div>
                    {intent.status === "pending" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={async () => {
                          await removePending(intent.id);
                          await refreshCounts();
                        }}
                      >
                        Poništi
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              className="mt-4 w-full"
              variant="outline"
              disabled={!online || pendingCount === 0}
              onClick={() => void drainNow()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Sinhronizuj sada
            </Button>
          </SheetContent>
        </Sheet>
      ) : (
        <span
          className="h-2 w-2 rounded-full sm:hidden"
          style={{ background: online ? "#16a34a" : "#d97706" }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function OfflineSidebarDot() {
  const { enabled, online } = useOfflineContext();
  if (!enabled) return null;
  return (
    <span
      className="mr-1 inline-block h-2 w-2 rounded-full"
      style={{ background: online ? "#16a34a" : "#d97706" }}
      title={online ? "Na mreži" : "Van mreži"}
    />
  );
}
