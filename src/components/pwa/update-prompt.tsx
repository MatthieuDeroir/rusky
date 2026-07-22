"use client";

import { useEffect, useState } from "react";

// Registers the service worker and, when a new version is waiting, shows a glass banner to
// reload into it. Also enables installability + offline. No-op when SW is unsupported.
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // In development the SW + HMR can fight and cause a reload loop — never register it there,
    // and unregister any stale worker (e.g. left over from a prod build served locally).
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;
        if (r.waiting) setWaiting(r.waiting);
        r.addEventListener("updatefound", () => {
          const nw = r.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(nw);
            }
          });
        });
      })
      .catch(() => {});

    // Reload once the new worker takes control.
    let refreshed = false;
    const onControllerChange = () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waiting) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[92%] sm:bottom-6">
      <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg">
        <span>Une nouvelle version est disponible.</span>
        <button
          type="button"
          onClick={() => waiting.postMessage("SKIP_WAITING")}
          className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          Mettre à jour
        </button>
      </div>
    </div>
  );
}
