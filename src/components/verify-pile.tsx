"use client";

import { useCallback, useRef, useState } from "react";
import type { PracticeResult } from "@/app/actions";
import { showXpToast } from "@/lib/xp-toast";

export interface PendingVerification {
  id: string;
  label: string; // ce qui était demandé, pour se repérer dans la pile
  answer: string; // ce que l'utilisateur avait répondu
  status: "checking" | "confirmed" | "corrected";
  note?: string;
}

/**
 * File d'attente des vérifications IA en arrière-plan (le "second avis" sur une réponse jugée
 * fausse au premier passage). Chaque réponse qui a besoin de l'IA est empilée ici dès l'envoi ;
 * l'utilisateur n'attend jamais ce résultat pour continuer — on l'affiche quand il arrive,
 * confirmé ou corrigé, puis on le retire de la pile après un court délai.
 */
export function useVerifyPile<Token>(refine: (token: Token) => Promise<PracticeResult>) {
  const [pile, setPile] = useState<PendingVerification[]>([]);
  const nextId = useRef(0);

  const enqueue = useCallback(
    (token: Token, label: string, answer: string, onResolved?: (result: PracticeResult) => void) => {
      const id = `v${nextId.current++}`;
      setPile((p) => [...p, { id, label, answer, status: "checking" }]);
      refine(token)
        .then((result) => {
          setPile((p) =>
            p.map((item) =>
              item.id === id
                ? { ...item, status: result.correct ? "corrected" : "confirmed", note: result.note }
                : item,
            ),
          );
          if (result.correct) showXpToast(result.xp);
          onResolved?.(result);
          const ttl = result.correct ? 4500 : 2600;
          setTimeout(() => setPile((p) => p.filter((item) => item.id !== id)), ttl);
        })
        .catch(() => {
          // Réseau/IA indisponible : on retire simplement l'entrée, le verdict rapide (faux)
          // écrit par submitPracticeAction/submitVocabAction reste tel quel.
          setPile((p) => p.filter((item) => item.id !== id));
        });
    },
    [refine],
  );

  return { pile, enqueue };
}

/** Petite pile flottante en bas de l'écran : une carte par vérification IA en cours ou qui
 * vient de se résoudre. Purement informatif, ne bloque jamais l'interaction. */
export function VerifyPile({ pile }: { pile: PendingVerification[] }) {
  if (pile.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 flex w-full max-w-sm -translate-x-1/2 flex-col-reverse gap-1.5 px-4 sm:bottom-6">
      {pile.map((item) => (
        <div
          key={item.id}
          className={`rounded-xl border px-3 py-2 text-xs shadow-lg backdrop-blur-md transition-colors ${
            item.status === "checking"
              ? "border-white/15 bg-black/50 text-foreground/60"
              : item.status === "corrected"
                ? "border-emerald-400/40 bg-emerald-950/60 text-emerald-200"
                : "border-white/10 bg-black/50 text-foreground/45"
          }`}
        >
          {item.status === "checking" && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Vérification IA de « {item.answer} »…
            </span>
          )}
          {item.status === "corrected" && (
            <span>
              Finalement accepté 👍 « {item.answer} »
              {item.note ? <span className="block text-emerald-300/70">{item.note}</span> : null}
            </span>
          )}
          {item.status === "confirmed" && <span>Confirmé faux — {item.label}</span>}
        </div>
      ))}
    </div>
  );
}
