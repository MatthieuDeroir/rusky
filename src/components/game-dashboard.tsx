import Link from "next/link";
import { Flame, Snowflake, Star, ArrowRight } from "lucide-react";
import { ProgressRing } from "@/components/progress-ring";
import { getLevel } from "@/lib/game-levels";
import type { GameStats } from "@/lib/xp";

// The Duolingo-style home header: streak, today's XP goal ring, playful level, and a CTA.
// Purely presentational — data is fetched by the page. Styled with the app's ink & gold tokens.
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
  const goalPct = stats.goal > 0 ? Math.min(1, stats.todayXp / stats.goal) : 0;

  return (
    <section className="glass-strong rounded-3xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground/55">Bonjour 👋</p>
          <div className="mt-1 flex items-center gap-2">
            <Star className="size-5 shrink-0 fill-primary text-primary" />
            <h2 className="truncate font-display text-xl">{level.title}</h2>
          </div>
          {/* Level progress toward the next playful rank */}
          <div className="mt-2 max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${Math.round(level.progress * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-foreground/45">
              {level.next
                ? `${stats.totalXp} XP · plus que ${level.next - stats.totalXp} pour le niveau suivant`
                : `${stats.totalXp} XP · niveau max 🎉`}
            </p>
          </div>
        </div>

        {/* Streak pill */}
        <div
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-semibold text-primary ring-1 ring-primary/25"
          title={`${stats.currentStreak} jour${stats.currentStreak > 1 ? "s" : ""} d’affilée`}
        >
          <Flame className="size-5" />
          <span className="tabular-nums">{stats.currentStreak}</span>
          {stats.streakFreezes > 0 && (
            <span className="flex items-center gap-0.5 text-sky-300/80" title="Gels de série">
              <Snowflake className="size-3.5" />
              <span className="text-xs tabular-nums">{stats.streakFreezes}</span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        {/* Today's XP goal ring */}
        <div className="flex items-center gap-3">
          <ProgressRing value={Math.min(stats.todayXp, stats.goal)} total={stats.goal} size={52} />
          <div>
            <p className="text-sm font-medium">
              {stats.todayXp} / {stats.goal} XP
            </p>
            <p className="text-xs text-foreground/50">
              {goalPct >= 1 ? "Objectif du jour atteint ✨" : "objectif du jour"}
            </p>
          </div>
        </div>

        <Link
          href={continueHref}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:brightness-105 active:scale-95"
        >
          {continueLabel}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
