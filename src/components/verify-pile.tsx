"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, XCircle } from "lucide-react";
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

const STATUS_ICON: Record<HistoryEntry["status"], React.ReactNode> = {
  checking: <Loader2 className="size-4 shrink-0 animate-spin text-foreground/40" />,
  correct: <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />,
  close: <CircleAlert className="size-4 shrink-0 text-amber-400" />,
  wrong: <XCircle className="size-4 shrink-0 text-red-400/80" />,
};

const STATUS_ACCENT: Record<HistoryEntry["status"], string> = {
  checking: "before:bg-white/15",
  correct: "before:bg-emerald-400/60",
  close: "before:bg-amber-400/60",
  wrong: "before:bg-red-400/50",
};

/** Historique à gauche de la carte (bureau) : un mot par ligne, réponse donnée, statut, et la
 * traduction/forme attendue. `absolute` + `right-[calc(100%+…)]` l'ancre directement au bord
 * gauche du conteneur de la PAGE (qui doit être `relative` — voir les pages `/exercices/*`) au
 * lieu de deviner sa position depuis le centre du viewport : par construction elle ne peut plus
 * jamais chevaucher la carte, quels que soient la largeur exacte, le padding ou le zoom texte.
 * Masquée tant que l'écran n'est pas assez large pour la loger avec une vraie marge. */
export function VerifyPile({ pile }: { pile: HistoryEntry[] }) {
  if (pile.length === 0) return null;
  return (
    <div
      className="glass-strong absolute top-0 right-[calc(100%+1.5rem)] z-30 hidden max-h-[70vh] w-72 flex-col rounded-2xl min-[1360px]:flex"
    >
      <p className="shrink-0 border-b border-white/8 px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground/40">
        Historique de session
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {pile.map((item) => (
          <div
            key={item.id}
            className={`before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full relative flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm ${STATUS_ACCENT[item.status]}`}
          >
            {STATUS_ICON[item.status]}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-foreground/90">{item.label}</span>
              </div>
              <div className="truncate text-xs text-foreground/45">
                « {item.answer || "…"} »
                {item.status === "checking" && (
                  <span className="text-foreground/35"> — vérification IA…</span>
                )}
              </div>
              {item.status !== "checking" && item.expected && item.expected.length > 0 && (
                <div className="truncate text-xs text-foreground/55">
                  → {item.expected.join(" / ")}
                </div>
              )}
              {item.mistakeKind && (
                <div className="text-[11px] italic text-foreground/35">
                  {MISTAKE_LABEL[item.mistakeKind]}
                </div>
              )}
              {item.note && item.status !== "checking" && (
                <div className="text-[11px] text-foreground/40">{item.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
