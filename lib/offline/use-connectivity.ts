"use client";

import * as React from "react";

const HEALTH_URL = "/api/health";
const PING_INTERVAL_MS = 30_000;

async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useConnectivity() {
  const [online, setOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!navigator.onLine) {
        if (!cancelled) setOnline(false);
        return;
      }
      const ok = await pingHealth();
      if (!cancelled) setOnline(ok);
    }

    void check();

    function onOnline() {
      void check();
    }

    function onOffline() {
      setOnline(false);
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(() => void check(), PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, []);

  return { online };
}
