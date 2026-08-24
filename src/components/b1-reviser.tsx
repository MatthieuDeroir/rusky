"use client";

import { useState } from "react";
import { B1NewWords } from "@/components/b1-new-words";
import { VocabCard } from "@/components/vocab-card";
import type { B1TodayCohort } from "@/app/objectif-b1/actions";

type Tab = "nouveaux" | "hier" | "melange";

const TABS: { key: Tab; label: string }[] = [
  { key: "nouveaux", label: "Nouveaux" },
  { key: "hier", label: "Hier" },
  { key: "melange", label: "Mélange" },
];

export function B1Reviser({
  cohort,
  yesterdayIds,
  mixIds,
}: {
  cohort: B1TodayCohort | null;
  yesterdayIds: number[];
  mixIds: number[];
}) {
  const [tab, setTab] = useState<Tab>("nouveaux");

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-fit gap-1 rounded-xl bg-white/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary/40 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "nouveaux" &&
        (cohort ? (
          <B1NewWords cohort={cohort} />
        ) : (
          <div className="glass-strong rounded-3xl p-10 text-center">
            <h2 className="text-xl font-semibold">Pas encore de vocabulaire B1</h2>
            <p className="mt-2 text-foreground/65">
              Le minimum B1 n’a pas encore été importé en base.
            </p>
          </div>
        ))}

      {tab === "hier" && (
        <VocabCard
          entryIds={yesterdayIds}
          emptyMessage={
            yesterdayIds.length === 0
              ? "Reviens ici demain, une fois que tu auras une première journée de mots derrière toi."
              : "Tous les mots d’hier sont déjà à jour — reviens plus tard."
          }
        />
      )}

      {tab === "melange" && (
        <VocabCard
          entryIds={mixIds}
          emptyMessage={
            mixIds.length === 0
              ? "Le mélange arrive une fois que tu as au moins deux journées de mots derrière toi."
              : "Tout est à jour dans le mélange pour l’instant — reviens plus tard."
          }
        />
      )}
    </div>
  );
}
