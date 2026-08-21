"use client";

import { useState } from "react";
import { PracticeCard } from "@/components/practice-card";
import { VocabCard } from "@/components/vocab-card";

type Mode = "reviser" | "traduire";

const MODES: { key: Mode; label: string; hint: string }[] = [
  {
    key: "reviser",
    label: "Réviser",
    hint: "Déclinaisons, conjugaisons et traductions intégrées.",
  },
  {
    key: "traduire",
    label: "Traduire",
    hint: "Vocabulaire pur, forme du dictionnaire.",
  },
];

/** Sélecteur de type d'exercice pour "Travailler ses erreurs" — pour l'instant Réviser et
 * Traduire, chacun piochant uniquement dans les mots dont la dernière tentative a échoué. */
export function ErreursExercise() {
  const [mode, setMode] = useState<Mode>("reviser");
  const active = MODES.find((m) => m.key === mode)!;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex w-fit gap-1 rounded-xl bg-white/5 p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === m.key
                  ? "bg-primary/40 text-foreground"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-foreground/45">{active.hint}</p>
      </div>

      {mode === "reviser" ? (
        <PracticeCard key="reviser" themes={[]} mistakesOnly />
      ) : (
        <VocabCard key="traduire" mistakesOnly />
      )}
    </div>
  );
}
