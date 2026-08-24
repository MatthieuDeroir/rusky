"use client";

import { useCallback, useState } from "react";
import { B1MasteryPool } from "@/components/b1-mastery-pool";
import { B1DayCalendar } from "@/components/b1-day-calendar";
import { VocabCard } from "@/components/vocab-card";
import { getB1PoolsAction, type B1Pools, type B1VocabWord } from "@/app/objectif-b1/actions";

type Tab = "nouveaux" | "hier" | "melange" | "historique";

export function B1Reviser({
  initial,
  initialTodayWords,
}: {
  initial: B1Pools | null;
  initialTodayWords: B1VocabWord[];
}) {
  const [pools, setPools] = useState(initial);
  const [tab, setTab] = useState<Tab>("nouveaux");

  // Un lot validé peut débloquer "hier"/"mélange" (ou le jour suivant côté "nouveaux") —
  // resynchro depuis le serveur plutôt que de deviner l'état localement.
  const refresh = useCallback(() => {
    getB1PoolsAction().then(setPools);
  }, []);

  if (!pools) {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">Pas encore de vocabulaire B1</h2>
        <p className="mt-2 text-foreground/65">
          Le minimum B1 n’a pas encore été importé en base.
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "nouveaux", label: "Nouveaux" },
    { key: "hier", label: "Hier" },
    { key: "melange", label: "Mélange" },
    { key: "historique", label: "Historique" },
  ];

  return (
    <div className="space-y-6">
      <p className="text-center text-xs text-foreground/40">
        Jour {pools.scheduledDayIndex + 1} / {pools.totalDays}
      </p>
      <div className="mx-auto flex w-fit flex-wrap justify-center gap-1 rounded-xl bg-white/5 p-1">
        {tabs.map((t) => (
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

      {tab === "nouveaux" && (
        <B1MasteryPool
          key={`nouveaux-${pools.scheduledDayIndex}-${pools.nouveaux.toIntroduce.length}-${pools.nouveaux.toTest.length}`}
          data={pools.nouveaux}
          label="Nouveaux"
          onValidated={refresh}
        />
      )}

      {tab === "hier" &&
        (pools.hier ? (
          <B1MasteryPool
            key={`hier-${pools.hier.toIntroduce.length}-${pools.hier.toTest.length}`}
            data={pools.hier}
            label="Hier"
            onValidated={refresh}
          />
        ) : (
          <div className="glass-strong rounded-3xl p-10 text-center">
            <h2 className="text-xl font-semibold">Rien à revoir pour l’instant</h2>
            <p className="mt-2 text-foreground/65">
              Reviens ici demain, une fois que tu auras une première journée de mots derrière toi.
            </p>
          </div>
        ))}

      {tab === "melange" && (
        <VocabCard
          entryIds={pools.mixEntryIds}
          emptyMessage={
            pools.mixEntryIds.length === 0
              ? "Le mélange arrive une fois que tu as validé au moins deux journées de mots."
              : "Tout est à jour dans le mélange pour l’instant — reviens plus tard."
          }
        />
      )}

      {tab === "historique" && (
        <B1DayCalendar scheduledDayIndex={pools.scheduledDayIndex} initialWords={initialTodayWords} />
      )}
    </div>
  );
}
