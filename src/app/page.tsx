import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCollection, getTypeProgress, dueReviewCount } from "@/lib/queries";
import { GameDashboard } from "@/components/game-dashboard";
import { HomeProgress } from "@/components/home-progress";
import { RadioPlayer } from "@/components/radio-player";
import { currentUserId } from "@/lib/auth";
import { getGameStats } from "@/lib/xp";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await currentUserId();
  const [items, stats, progress, due] = await Promise.all([
    getCollection(userId),
    getGameStats(userId),
    getTypeProgress(userId),
    dueReviewCount(userId),
  ]);

  if (items.length === 0) {
    return (
      <div className="glass-strong mx-auto mt-6 max-w-xl rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl">Bienvenue 👋</h1>
        <p className="mt-3 text-foreground/65">
          Construis ton dictionnaire russe au fil de tes lectures. Ajoute un premier mot : l’app
          détecte sa nature et la forme rencontrée, puis remplit la bonne case de son tableau.
        </p>
        <Button render={<Link href="/add" />} nativeButton={false} size="lg" className="mt-6">
          Ajouter un premier mot
        </Button>
      </div>
    );
  }

  // "Continuer" targets the most useful next action.
  const anyIncomplete = items.some((i) => i.total > 0 && i.discovered < i.total);
  const cont =
    due > 0
      ? { href: "/reviser", label: `Réviser (${due})` }
      : anyIncomplete
        ? { href: "/parcours", label: "S’entraîner" }
        : { href: "/add", label: "Ajouter un mot" };

  return (
    <div className="space-y-8">
      <GameDashboard stats={stats} continueHref={cont.href} continueLabel={cont.label} />

      <RadioPlayer />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/40">
            Progression par nature
          </h2>
          <Link
            href="/parcours"
            className="inline-flex items-center gap-1 text-xs text-foreground/45 transition-colors hover:text-primary"
          >
            Parcours <ArrowRight className="size-3.5" />
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
