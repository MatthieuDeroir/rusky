"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";

const KEY = "rusky:last-list";
/** Vrai dès qu'on a navigué à l'intérieur de l'app : « précédent » ramène alors à la bonne page. */
let navigatedInApp = false;

/** À placer une fois dans le layout : note les changements de page faits dans l'app. */
export function RouteTracker() {
  const path = usePathname();
  const first = useRef(path);
  useEffect(() => {
    if (path !== first.current) navigatedInApp = true;
  }, [path]);
  return null;
}

/** Retient l'URL exacte de la liste (filtre, page, recherche) pour pouvoir y revenir. */
export function RememberList() {
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, location.pathname + location.search);
    } catch {}
  });
  return null;
}

/** Retour : un vrai « précédent » (même filtre, même page, même position), sinon la dernière liste vue. */
export function BackLink({ label, fallback }: { label: string; fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (navigatedInApp) return router.back();
        let target = fallback;
        try {
          target = sessionStorage.getItem(KEY) ?? fallback;
        } catch {}
        router.push(target);
      }}
      className="inline-flex items-center gap-1 text-muted hover:text-ink"
    >
      <ChevronLeft className="size-4" /> {label}
    </button>
  );
}
