"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { displayAccent } from "@/lib/grammar";
import { CASE_ORDER, CASE_USAGE, triggersByCase } from "@/lib/cases";
import { CaseDrill } from "@/components/case-drill";
import { Button } from "@/components/ui/button";

export function CaseTrainer({ collected }: { collected: string[] }) {
  const [drilling, setDrilling] = useState(false);
  const collectedSet = new Set(collected);
  const all = triggersByCase();
  // Only triggers (prepositions / verbs) the user has actually collected.
  const grouped = Object.fromEntries(
    CASE_ORDER.map((c) => [c, all[c].filter((t) => collectedSet.has(t.trigger))]),
  ) as typeof all;
  const hasAny = CASE_ORDER.some((c) => grouped[c].length > 0);

  if (drilling) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setDrilling(false)}
          className="flex items-center gap-2 text-sm text-foreground/60 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux règles
        </button>
        <CaseDrill />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground/60">
          Les 6 cas et leur règle facile (question de cas). L’exercice mélange les déclencheurs
          (prépositions, verbes) que tu as collectés.
        </p>
        <Button type="button" onClick={() => setDrilling(true)} disabled={!hasAny}>
          S’entraîner
        </Button>
      </div>

      {!hasAny && (
        <p className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/25">
          Tu n’as pas encore collecté de préposition / verbe à rection (о, в, к, помогать…).
          Ajoute-en pour débloquer l’entraînement — les règles ci-dessous restent là comme
          référence.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {CASE_ORDER.map((c) => (
          <section key={c} className="glass rounded-2xl p-5">
            <h2 className="font-display text-xl">{CASE_USAGE[c].title}</h2>
            <p className="mt-1 text-sm text-foreground/60">{CASE_USAGE[c].when}</p>
            {CASE_USAGE[c].tip && (
              <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm text-foreground/80 ring-1 ring-primary/20">
                <span className="mr-1">💡</span>
                {displayAccent(CASE_USAGE[c].tip!)}
              </p>
            )}
            {all[c].length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-foreground/40">
                  Déclencheurs ({all[c].length}) · les tiens sont surlignés
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {all[c].map((t) => {
                    const owned = collectedSet.has(t.trigger);
                    return (
                      <span
                        key={`${t.kind}-${t.trigger}`}
                        title={`${t.kind}${owned ? " · dans ta collection" : ""}`}
                        className={`rounded-lg px-2 py-1 text-sm ring-1 ${
                          owned
                            ? "bg-primary/25 text-foreground ring-primary/40"
                            : "bg-white/5 text-foreground/45 ring-transparent"
                        }`}
                      >
                        {displayAccent(t.trigger)}
                        {t.kind === "verbe" && (
                          <span className="ml-1 text-[10px] text-foreground/40">v.</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
