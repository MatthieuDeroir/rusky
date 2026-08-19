"use client";

import { useCallback, useRef, useState } from "react";
import type { PracticeResult } from "@/app/actions";
import type { MistakeKind } from "@/lib/mistral";
import { showXpToast } from "@/lib/xp-toast";

const MISTAKE_LABEL: Record<MistakeKind, string> = {
  "autre-mot": "confusion avec un autre mot",
  "autre-forme": "bonne racine, mauvaise forme",
  oubli: "au hasard / oubli",
};

export interface HistoryEntry {
  id: string;
  label: string; // le mot demandé, pour se repérer dans l'historique
  answer: string; // ce que l'utilisateur a répondu
  status: "checking" | "correct" | "close" | "wrong";
  expected?: string[];
  note?: string;
  mistakeKind?: MistakeKind;
}

/**
 * Historique de session des réponses (Réviser / Traduire), affiché à côté de la carte : chaque
 * réponse y apparaît immédiatement, y compris celles qui doivent encore attendre le second avis
 * IA en arrière-plan (statut "checking" jusqu'à résolution) — l'utilisateur n'attend jamais ce
 * résultat pour continuer, mais peut le retrouver ici, avec la traduction attendue et le genre
 * de raté (confusion de mot, de forme, ou réponse au hasard).
 */
export function useVerifyPile<Token>(refine: (token: Token) => Promise<PracticeResult>) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const nextId = useRef(0);

  const statusOf = (r: PracticeResult): HistoryEntry["status"] =>
    !r.correct ? "wrong" : r.close ? "close" : "correct";

  /** Réponse déjà tranchée par le verdict rapide (pas besoin d'IA) — entre directement. */
  const record = useCallback((label: string, answer: string, result: PracticeResult) => {
    const id = `h${nextId.current++}`;
    setHistory((h) => [
      {
        id,
        label,
        answer,
        status: statusOf(result),
        expected: result.expected,
        note: result.note,
        mistakeKind: result.mistakeKind,
      },
      ...h,
    ]);
  }, []);

  /** Réponse dont le verdict définitif dépend d'un second avis IA en tâche de fond. */
  const enqueue = useCallback(
    (token: Token, label: string, answer: string, onResolved?: (result: PracticeResult) => void) => {
      const id = `h${nextId.current++}`;
      setHistory((h) => [{ id, label, answer, status: "checking" }, ...h]);
      refine(token)
        .then((result) => {
          setHistory((h) =>
            h.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: statusOf(result),
                    expected: result.expected,
                    note: result.note,
                    mistakeKind: result.mistakeKind,
                  }
                : item,
            ),
          );
          if (result.correct) showXpToast(result.xp);
          onResolved?.(result);
        })
        .catch(() => {
          // Réseau/IA indisponible : le verdict rapide (faux), déjà écrit par
          // submitPracticeAction/submitVocabAction, reste tel quel.
          setHistory((h) => h.map((item) => (item.id === id ? { ...item, status: "wrong" } : item)));
        });
    },
    [refine],
  );

  return { history, record, enqueue };
}

const STATUS_STYLE: Record<HistoryEntry["status"], string> = {
  checking: "border-white/15 bg-white/[0.03] text-foreground/60",
  correct: "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200",
  close: "border-amber-400/30 bg-amber-400/[0.06] text-amber-200",
  wrong: "border-red-400/25 bg-red-400/[0.05] text-red-200/80",
};

/** Historique à gauche de la carte (bureau) : un mot par ligne, réponse donnée, statut, et la
 * traduction/forme attendue. Masqué sur petit écran — pas la place, la carte prime. */
export function VerifyPile({ pile }: { pile: HistoryEntry[] }) {
  if (pile.length === 0) return null;
  return (
    <div className="hidden xl:block fixed left-4 top-24 z-30 w-64 max-h-[70vh] overflow-y-auto space-y-1.5 pr-1">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-foreground/40">
        Historique de session
      </p>
      {pile.map((item) => (
        <div
          key={item.id}
          className={`rounded-lg border px-2.5 py-2 text-xs transition-colors ${STATUS_STYLE[item.status]}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{item.label}</span>
            {item.status === "checking" && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          <div className="mt-0.5 text-foreground/50">
            « {item.answer || "…"} »
            {item.status === "checking" && " — vérification IA…"}
          </div>
          {item.status !== "checking" && item.expected && item.expected.length > 0 && (
            <div className="mt-0.5 text-foreground/40">→ {item.expected.join(" / ")}</div>
          )}
          {item.mistakeKind && (
            <div className="mt-0.5 text-[11px] italic text-foreground/35">
              {MISTAKE_LABEL[item.mistakeKind]}
            </div>
          )}
          {item.note && item.status !== "checking" && (
            <div className="mt-0.5 text-[11px] text-foreground/40">{item.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}
