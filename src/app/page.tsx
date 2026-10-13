import Link from "next/link";
import { ArrowRight, CalendarDays, Sun } from "lucide-react";
import { getCollection, getTypeProgress } from "@/lib/queries";
import { GameDashboard } from "@/components/game-dashboard";
import { HomeProgress } from "@/components/home-progress";
import { RadioPlayer } from "@/components/radio-player";
import { currentUserId } from "@/lib/auth";
import { getGameStats } from "@/lib/xp";
import { getUnitStates } from "@/lib/reader/progress";
import { dueReviewCount as readerDueCount } from "@/lib/reader/review";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await currentUserId();
  const [items, stats, progress, readerDue, units] = await Promise.all([
    getCollection(userId),
    getGameStats(userId),
    getTypeProgress(userId),
    readerDueCount(userId),
    getUnitStates(userId),
  ]);
  const done = units.units.filter((u) => u.status === "done").length;

  return (
    <div className="space-y-8">
      <GameDashboard stats={stats} continueHref="/jour" continueLabel="Aujourd’hui" />

      {/* Pivot « Lire » (v3) : le quotidien consolide, le week-end apprend. */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/jour" className="glass-strong glass-lift rounded-3xl p-5">
          <div className="flex items-center gap-2 text-primary">
            <Sun className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Aujourd’hui · 10-20 min</span>
          </div>
          <p className="mt-2 font-display text-xl">Révision, texte du jour, phrase à décortiquer</p>
          <p className="mt-1 text-sm text-foreground/55">
            {readerDue > 0 ? `${readerDue} carte${readerDue > 1 ? "s" : ""} à réviser` : "Rien d’urgent à réviser"}
          </p>
        </Link>
        <Link href={`/seance/${units.current.id}`} className="glass-strong glass-lift rounded-3xl p-5">
          <div className="flex items-center gap-2 text-primary">
            <CalendarDays className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Week-end · Unité {units.current.n}/12
            </span>
          </div>
          <p className="mt-2 font-display text-xl">{units.current.title}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(done / 12) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-foreground/50">{done}/12 structures validées</p>
        </Link>
      </section>

      <RadioPlayer />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/40">
            Progression par nature
          </h2>
          <Link
            href="/collection"
            className="inline-flex items-center gap-1 text-xs text-foreground/45 transition-colors hover:text-primary"
          >
            Collection <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <HomeProgress rows={progress} />
      </section>

      <Link
        href="/collection"
        className="glass glass-lift flex items-center justify-between rounded-2xl px-5 py-4"
      >
        <div>
          <p className="font-medium">Ma collection</p>
          <p className="text-sm text-foreground/55">
            {items.length} mot{items.length > 1 ? "s" : ""} · parcours tes mots et leurs tableaux
          </p>
        </div>
        <ArrowRight className="size-5 text-foreground/40" />
      </Link>
    </div>
  );
}
