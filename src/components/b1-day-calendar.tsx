"use client";

import { useState, useTransition } from "react";
import { getB1DayWordsAction, type B1VocabWord } from "@/app/objectif-b1/actions";
import { displayAccent } from "@/lib/grammar";
import { Badge } from "@/components/ui/badge";

/** Petit calendrier de consultation (lecture seule) : parcourir les 20 mots d'un jour passé,
 * du plus récent (aujourd'hui) au plus ancien (jour 1). Ne touche à rien côté Encounter/SRS —
 * juste une liste, contrairement à B1MasteryPool. */
export function B1DayCalendar({
  scheduledDayIndex,
  initialWords,
}: {
  scheduledDayIndex: number;
  /** Mots du jour courant, déjà chargés côté serveur — évite un aller-retour au montage. */
  initialWords: B1VocabWord[];
}) {
  const [selected, setSelected] = useState(scheduledDayIndex);
  const [words, setWords] = useState<B1VocabWord[] | null>(initialWords);
  const [isLoading, startLoad] = useTransition();

  function select(dayIndex: number) {
    setSelected(dayIndex);
    startLoad(async () => {
      setWords(await getB1DayWordsAction(dayIndex));
    });
  }

  const days = Array.from({ length: scheduledDayIndex + 1 }, (_, i) => scheduledDayIndex - i);

  function dayLabel(dayIndex: number) {
    if (dayIndex === scheduledDayIndex) return "Aujourd’hui";
    if (dayIndex === scheduledDayIndex - 1) return "Hier";
    return `Jour ${dayIndex + 1}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => select(d)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selected === d
                ? "bg-primary/40 text-foreground"
                : "bg-white/5 text-foreground/60 hover:text-foreground"
            }`}
          >
            {dayLabel(d)}
          </button>
        ))}
      </div>

      {isLoading || words === null ? (
        <p className="text-center text-sm text-foreground/50">Chargement…</p>
      ) : words.length === 0 ? (
        <p className="text-center text-sm text-foreground/50">
          Aucun mot enregistré pour ce jour.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {words.map((w) => (
            <li
              key={w.entryId}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-2.5 text-sm"
            >
              <div>
                <span className="font-medium">{displayAccent(w.accented)}</span>
                <span className="ml-2 text-foreground/50">
                  {w.translationsFr || "— pas de traduction —"}
                </span>
              </div>
              <Badge
                variant="secondary"
                className={w.mastered ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200" : "bg-white/10"}
              >
                {w.mastered ? "maîtrisé" : w.encountered ? "en cours" : "pas encore vu"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
