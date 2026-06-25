"use client";

import * as React from "react";
import { toast } from "sonner";
import { countPending } from "@/lib/offline/outbox";
import { isOfflineEnabled } from "@/lib/offline/enabled";

export function SwUpdatePrompt() {
  React.useEffect(() => {
    if (!isOfflineEnabled() || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    async function setup() {
      registration = await navigator.serviceWorker.ready;

      registration.addEventListener("updatefound", () => {
        const worker = registration?.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;

          void (async () => {
            const pending = await countPending();
            if (pending > 0) return;

            toast.info("Nova verzija — osveži", {
              duration: Infinity,
              action: {
                label: "Osveži",
                onClick: () => {
                  worker.postMessage({ type: "SKIP_WAITING" });
                  window.location.reload();
                },
              },
            });
          })();
        });
      });
    }

    void setup();

    function onControllerChange() {
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
