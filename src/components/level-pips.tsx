"use client";

import { MAX_LEVEL } from "@/lib/srs";
import type { PracticeResult } from "@/app/actions";

/**
 * Competence level of a card, shown instead of a "comes back in N days" date: one pip per
 * level, filled up to the current one. A correct answer moves up a notch, a mistake drops
 * back to zero, an approximate answer holds the level.
 */
export function LevelPips({ result }: { result: PracticeResult }) {
  const { level, previousLevel } = result;
  const up = level > previousLevel;
  const down = level < previousLevel;

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: MAX_LEVEL }, (_, i) => {
          const filled = i < level;
          const justEarned = up && i === level - 1;
          const justLost = down && i >= level && i < previousLevel;
          return (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                justEarned
                  ? "bg-emerald-400"
                  : filled
                    ? "bg-primary"
                    : justLost
                      ? "bg-red-400/40"
                      : "bg-white/12"
              }`}
            />
          );
        })}
      </div>
      <p className="text-xs text-foreground/50">
        Niveau {level} · {result.levelLabel}
        {up && <span className="ml-1 text-emerald-300">↑</span>}
        {down && <span className="ml-1 text-red-300">↓ retour à zéro</span>}
      </p>
    </div>
  );
}
