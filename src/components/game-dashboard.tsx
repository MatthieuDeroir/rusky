import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProgressRing } from "@/components/progress-ring";
import { getLevel } from "@/lib/game-levels";
import type { GameStats } from "@/lib/xp";

// Compact home hero: playful level + level bar on the left, the day's XP-goal ring and the
// single primary action on the right. The streak lives in the header (Citoyen-style).
export function GameDashboard({
  stats,
  continueHref,
  continueLabel,
}: {
  stats: GameStats;
  continueHref: string;
  continueLabel: string;
}) {
  const level = getLevel(stats.totalXp);
  const goalReached = stats.goal > 0 && stats.todayXp >= stats.goal;

  return (
    <section className="glass-strong relative overflow-hidden rounded-3xl p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Level */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">
            Niveau {level.level}
          </p>
          <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">{level.title}</h1>
          <div className="mt-3 max-w-sm">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-700"
                style={{ width: `${Math.round(level.progress * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-foreground/45">
              {level.next
                ? `${stats.totalXp} XP · encore ${level.next - stats.totalXp} au prochain palier`
                : `${stats.totalXp} XP · palier maximal 🎉`}
            </p>
          </div>
        </div>

        {/* Day's action */}
        <div className="flex items-center gap-4 border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <ProgressRing value={Math.min(stats.todayXp, stats.goal)} total={stats.goal} size={52} />
          <div className="min-w-0">
            <p className="text-sm font-medium tabular-nums">
              {stats.todayXp}/{stats.goal} XP
            </p>
            <p className="mb-2 text-xs text-foreground/50">
              {goalReached ? "objectif atteint ✨" : "aujourd’hui"}
            </p>
            <Link
              href={continueHref}
              className="group inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
            >
              {continueLabel}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
