"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { answerCardsAction } from "@/app/actions";
import type { Rating } from "@/lib/srs";
import { cn } from "@/lib/utils";

type Status = "idle" | "saving" | "saved" | "error";
interface Job {
  entryId: number;
  answer: Rating | "known";
}

const Ctx = createContext<{ save: (j: Job) => void; status: Status; pending: number; retry: () => void } | null>(null);

const RETRY_MS = [1500, 4000, 10000];

/**
 * File d'enregistrement des réponses de la séance. Chaque réponse part tout de suite, dans
 * l'ordre ; un échec (réseau, serveur) est retenté automatiquement, puis signalé avec un bouton
 * « Réessayer ». Tant qu'une réponse n'est pas enregistrée, quitter la page demande confirmation.
 */
export function SaverProvider({ children }: { children: React.ReactNode }) {
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [pending, setPending] = useState(0);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus("saving");
    while (queue.current.length) {
      // Toutes les réponses en attente partent ensemble : sur une connexion lente, c'est une seule
      // requête au lieu d'une par carte.
      const batch = queue.current.slice(0, 50);
      let ok = false;
      for (let attempt = 0; attempt <= RETRY_MS.length && !ok; attempt++) {
        try {
          await answerCardsAction(batch);
          ok = true;
        } catch {
          if (attempt < RETRY_MS.length) await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
        }
      }
      if (!ok) {
        // On garde les réponses en file : rien n'est perdu, l'utilisateur relance.
        running.current = false;
        setStatus("error");
        return;
      }
      queue.current.splice(0, batch.length);
      setPending(queue.current.length);
    }
    running.current = false;
    setStatus("saved");
  }, []);

  const save = useCallback(
    (j: Job) => {
      queue.current.push(j);
      setPending(queue.current.length);
      void run();
    },
    [run],
  );

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (queue.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  return <Ctx value={{ save, status, pending, retry: () => void run() }}>{children}</Ctx>;
}

export function useSaver() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSaver hors de SaverProvider");
  return c.save;
}

/** Indicateur discret : chaque réponse est enregistrée dès le clic. */
export function SaveStatus() {
  const c = useContext(Ctx);
  if (!c || c.status === "idle") return null;
  if (c.status === "error")
    return (
      <button
        type="button"
        onClick={c.retry}
        className="flex items-center gap-1.5 rounded-full bg-wrong-soft px-3 py-1 text-[14px] text-wrong"
      >
        <CloudOff className="size-4" /> {c.pending} réponse{c.pending > 1 ? "s" : ""} non enregistrée{c.pending > 1 ? "s" : ""}, réessayer
      </button>
    );
  return (
    <span
      className={cn("flex items-center gap-1.5 text-[14px]", c.status === "saved" ? "text-known" : "text-muted")}
      role="status"
      aria-live="polite"
    >
      {c.status === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      {c.status === "saving" ? "Enregistrement…" : "Enregistré"}
    </span>
  );
}
