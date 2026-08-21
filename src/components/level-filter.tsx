"use client";

import { MAX_LEVEL, levelLabel } from "@/lib/srs";

/** Niveau de maîtrise (0..MAX_LEVEL) à côté des cartes d'exercice — filtre sur le niveau de la
 * forme de base (carte Traduire russe → français), même définition que dans la Collection. */
export function LevelFilter({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
          value === undefined
            ? "bg-primary/40 text-foreground"
            : "bg-white/5 text-foreground/60 hover:text-foreground"
        }`}
      >
        Tous niveaux
      </button>
      {Array.from({ length: MAX_LEVEL + 1 }, (_, lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onChange(lvl)}
          title={levelLabel(lvl)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            value === lvl
              ? "bg-primary/40 text-foreground"
              : "bg-white/5 text-foreground/60 hover:text-foreground"
          }`}
        >
          N{lvl}
        </button>
      ))}
    </div>
  );
}
