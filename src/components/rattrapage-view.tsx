"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { ReviewKind } from "@/lib/queries";
import { QuizCard } from "@/components/quiz-card";
import { TranslateCard } from "@/components/translate-card";
import { SpeakCard } from "@/components/speak-card";
import { CaseDrill } from "@/components/case-drill";

const KINDS: { key: ReviewKind; label: string; sub: string }[] = [
  { key: "forme", label: "Formes", sub: "Déclinaisons & conjugaisons ratées" },
  { key: "ru-fr", label: "Traduire · Russe → Français", sub: "Traductions RU→FR ratées" },
  { key: "fr-ru", label: "Traduire · Français → Russe", sub: "Traductions FR→RU ratées" },
  { key: "speak", label: "Parler", sub: "Prononciations ratées" },
  { key: "case", label: "Cas", sub: "Règles « quel cas » ratées" },
];

export function RattrapageView({ counts }: { counts: Record<ReviewKind, number> }) {
  const [active, setActive] = useState<ReviewKind | null>(null);

  if (active) {
    const meta = KINDS.find((k) => k.key === active)!;
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="flex items-center gap-2 text-sm text-foreground/60 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Tous les rattrapages
        </button>
        <h2 className="font-display text-xl">{meta.label}</h2>
        {active === "forme" ? (
          <QuizCard mode="discovered" review />
        ) : active === "speak" ? (
          <SpeakCard review />
        ) : active === "case" ? (
          <CaseDrill review />
        ) : (
          <TranslateCard review direction={active} />
        )}
      </div>
    );
  }

  const total =
    counts.forme + counts["ru-fr"] + counts["fr-ru"] + counts.speak + counts.case;

  if (total === 0) {
    return (
      <div className="glass-strong mx-auto mt-6 max-w-xl rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">Rien à rattraper 🎉</h2>
        <p className="mt-3 text-foreground/65">
          Aucune réponse ratée en attente. Quand tu butes sur un mot (mauvaise réponse ou
          « Je ne sais pas ») dans un exercice, il apparaîtra ici pour que tu le revoies.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {KINDS.map((k) => {
        const n = counts[k.key];
        return (
          <button
            key={k.key}
            type="button"
            disabled={n === 0}
            onClick={() => setActive(k.key)}
            className={`glass glass-lift rounded-2xl p-5 text-left transition-colors ${
              n === 0 ? "cursor-not-allowed opacity-40" : "hover:bg-white/10"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium">{k.label}</h2>
              <span
                className={`font-display text-2xl ${n > 0 ? "text-primary" : "text-foreground/40"}`}
              >
                {n}
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground/55">{k.sub}</p>
            <p className="mt-3 text-xs text-foreground/40">
              {n === 0 ? "à jour" : `${n} mot${n > 1 ? "s" : ""} à revoir`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
