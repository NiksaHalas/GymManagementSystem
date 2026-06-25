"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConnectivity } from "@/lib/offline/use-connectivity";
import { drainOutbox } from "@/lib/offline/sync";
import { countPending, listAll } from "@/lib/offline/outbox";
import { refreshOfflineCache } from "@/lib/offline/cache";
import { isOfflineEnabled } from "@/lib/offline/enabled";
import type { OutboxIntent } from "@/lib/offline/types";

const DRAIN_INTERVAL_MS = 60_000;

export function useOfflineSync(enabled: boolean) {
  const { online } = useConnectivity();
  const router = useRouter();
  const [pendingCount, setPendingCount] = React.useState(0);
  const [intents, setIntents] = React.useState<OutboxIntent[]>([]);
  const drainingRef = React.useRef(false);

  const refreshCounts = React.useCallback(async () => {
    if (!enabled) {
      setPendingCount(0);
      setIntents([]);
      return;
    }
    const [count, all] = await Promise.all([countPending(), listAll()]);
    setPendingCount(count);
    setIntents(all.filter((i) => i.status !== "syncing"));
  }, [enabled]);

  const runDrain = React.useCallback(async () => {
    if (!enabled || !online || drainingRef.current) return;
    drainingRef.current = true;
    try {
      const result = await drainOutbox();
      if (result.skippedHandover) {
        toast.warning(
          "Na čekanju su operacije drugog radnika — prijavite se istim nalogom da biste sinhronizovali.",
        );
      } else if (result.synced > 0) {
        await refreshOfflineCache();
        router.refresh();
      }
      await refreshCounts();
    } finally {
      drainingRef.current = false;
    }
  }, [enabled, online, router, refreshCounts]);

  React.useEffect(() => {
    const t = window.setTimeout(() => void refreshCounts(), 0);
    return () => window.clearTimeout(t);
  }, [refreshCounts]);

  React.useEffect(() => {
    if (!enabled || !online) return;
    void runDrain();
    const interval = setInterval(() => void runDrain(), DRAIN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, online, runDrain]);

  React.useEffect(() => {
    if (!enabled || !online) return;
    function onOnline() {
      void runDrain();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled, online, runDrain]);

  return {
    online,
    pendingCount,
    intents,
    refreshCounts,
    drainNow: runDrain,
  };
}

export function useOfflineEnabled() {
  return isOfflineEnabled();
}
