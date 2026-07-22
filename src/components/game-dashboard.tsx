import Link from "next/link";
import { Flame, Snowflake, ArrowRight } from "lucide-react";
import { ProgressRing } from "@/components/progress-ring";
import { getLevel } from "@/lib/game-levels";
import type { GameStats } from "@/lib/xp";

// Home hero — "ton carnet russe": the playful level in Lora, a wax-seal streak medallion, the
// level progress, and the day's action. Editorial and calm; the medallion is the one flourish.
export function GameDashboard({
  stats,
  wordsCount,
  formsDiscovered,
  continueHref,
  continueLabel,
}: {
  stats: GameStats;
  wordsCount: number;
  formsDiscovered: number;
  continueHref: string;
  continueLabel: string;
}) {
  const level = getLevel(stats.totalXp);
  const goalReached = stats.goal > 0 && stats.todayXp >= stats.goal;

  return (
    <section className="glass-strong relative overflow-hidden rounded-[1.75rem] p-6 sm:p-8">
      {/* Ambient gilt glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">
              Ton carnet russe
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              {level.title}
            </h1>
            <p className="mt-1.5 text-sm text-foreground/55">
              Niveau {level.level} · {wordsCount} mot{wordsCount > 1 ? "s" : ""} ·{" "}
              {formsDiscovered} forme{formsDiscovered > 1 ? "s" : ""} découverte
              {formsDiscovered > 1 ? "s" : ""}
            </p>
          </div>

          {/* Streak medallion */}
          <div className="flex shrink-0 flex-col items-center">
            <div className="relative grid size-16 place-items-center rounded-full bg-primary/12 ring-1 ring-primary/30">
              <Flame className="size-7 text-primary" />
              <span className="absolute -bottom-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-bold tabular-nums text-primary-foreground shadow-sm">
                {stats.currentStreak}
              </span>
            </div>
            <span className="mt-2.5 flex items-center gap-1 text-[11px] text-foreground/45">
              série
              {stats.streakFreezes > 0 && (
                <span className="flex items-center gap-0.5 text-sky-300/70">
                  · <Snowflake className="size-3" />
                  {stats.streakFreezes}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Level progress toward the next playful rank */}
        <div className="mt-6">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-700"
              style={{ width: `${Math.round(level.progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-foreground/45">
            {level.next
              ? `${stats.totalXp} XP · encore ${level.next - stats.totalXp} avant le prochain palier`
              : `${stats.totalXp} XP · palier maximal atteint 🎉`}
          </p>
        </div>

        {/* Day's action */}
        <div className="mt-7 flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <ProgressRing value={Math.min(stats.todayXp, stats.goal)} total={stats.goal} size={54} />
            <div>
              <p className="text-sm font-medium tabular-nums">
                {stats.todayXp} / {stats.goal} XP
              </p>
              <p className="text-xs text-foreground/50">
                {goalReached ? "objectif du jour atteint ✨" : "objectif du jour"}
              </p>
            </div>
          </div>

          <Link
            href={continueHref}
            className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
          >
            {continueLabel}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
