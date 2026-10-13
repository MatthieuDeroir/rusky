"use client";

import { useEffect } from "react";

/** Enregistre le service worker en production (cache des fichiers statiques). En développement,
 * il est désinscrit : il gênerait le rechargement à chaud. Jamais de rechargement de page ici. */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
