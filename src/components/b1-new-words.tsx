"use client";

import { useState, useTransition } from "react";
import {
  introduceB1WordAction,
  type B1TodayCohort,
} from "@/app/objectif-b1/actions";
import { displayAccent } from "@/lib/grammar";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Découverte des mots du jour (§L) : aucune des cartes d'exercice existantes ne peut servir un
 * mot jamais rencontré (toutes exigent un Encounter préalable) — geste minimal ici : montrer le
 * mot + sa traduction, "j'ai vu ce mot" pose l'Encounter (même primitive que /add) et le fait
 * entrer dans la collection/le SRS. Les révisions ultérieures (Hier/Mélange) réutilisent ensuite
 * VocabCard sans rien de nouveau. */
export function B1NewWords({ cohort }: { cohort: B1TodayCohort }) {
  const [words, setWords] = useState(cohort.words);
  const [isIntroducing, startIntroduce] = useTransition();
  const pending = words.filter((w) => !w.encountered);
  const current = pending[0];
  const seenCount = words.length - pending.length;

  function introduce() {
    if (!current || isIntroducing) return;
    startIntroduce(async () => {
      const { xp } = await introduceB1WordAction(current.entryId);
      showXpToast(xp);
      setWords((prev) =>
        prev.map((w) => (w.entryId === current.entryId ? { ...w, encountered: true } : w)),
      );
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">
          Jour {cohort.dayIndex + 1} / {cohort.totalDays}
        </Badge>
        <span className="text-sm text-foreground/55 tabular-nums">
          {seenCount}/{words.length} mots vus
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-500 ease-out"
          style={{ width: `${words.length ? (seenCount / words.length) * 100 : 0}%` }}
        />
      </div>

      {current ? (
        <div className="glass-strong rounded-3xl p-8 text-center">
          <Badge variant="secondary" className="bg-white/10">
            {current.typeLabel}
          </Badge>
          <div className="font-display mt-4 text-5xl">{displayAccent(current.accented)}</div>
          <div className="mt-4 text-xl text-foreground/70">
            {current.translationsFr || "— pas encore de traduction française —"}
          </div>
          <Button size="lg" className="mt-6" disabled={isIntroducing} onClick={introduce}>
            {isIntroducing ? "…" : "Mot suivant · j’ai vu ce mot"}
          </Button>
        </div>
      ) : (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <h2 className="text-xl font-semibold">Journée terminée 🎉</h2>
          <p className="mt-2 text-foreground/65">
            Les {words.length} mots du jour sont dans ta collection. Retrouve-les demain dans
            l’onglet « Hier », puis dans « Mélange » les jours suivants.
          </p>
        </div>
      )}
    </div>
  );
}
