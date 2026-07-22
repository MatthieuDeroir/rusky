import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { currentUserId } from "@/lib/auth";
import { getCoverage } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parcours · Русский" };

// Map a coverage type (from the dictionary) to the Exercices browser's type key, so a Parcours
// card opens straight onto that type's exercises rather than the global overview.
const EX_TYPE: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adjective: "adj",
  pronoun: "pronoun",
  numeral: "numeral",
  other: "other",
};

export default async function ParcoursPage() {
  const userId = await currentUserId();
  const rows = await getCoverage(userId);

  const collected = rows.reduce((s, r) => s + r.collected, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const overallPct = total > 0 ? Math.round((collected / total) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-3xl">Parcours</h1>
        <p className="mt-1 text-sm text-foreground/55">
          Ta couverture du dictionnaire russe, par nature de mot. Chaque thème indique la part
          déjà rencontrée sur tout ce qui existe dans la base.
        </p>
      </div>

      {/* Overall coverage */}
      <section className="glass-strong relative overflow-hidden rounded-3xl p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/40">
              Dictionnaire exploré
            </p>
            <p className="mt-1 text-sm text-foreground/60">
              {collected.toLocaleString("fr")} / {total.toLocaleString("fr")} mots
            </p>
          </div>
          <span className="font-display text-4xl text-primary">{overallPct}%</span>
        </div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
            style={{ width: `${Math.max(overallPct, 0.6)}%` }}
          />
        </div>
      </section>

      {/* Per-theme coverage */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <Link
            key={r.type}
            href={`/exercices?type=${EX_TYPE[r.type] ?? ""}`}
            className="glass glass-lift group rounded-2xl p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl">{r.label}</h2>
              <span className="font-display text-2xl text-primary">{r.pct}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${Math.max(r.pct, r.collected > 0 ? 1 : 0)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-foreground/50">
              <span>
                {r.collected.toLocaleString("fr")} / {r.total.toLocaleString("fr")} découverts
              </span>
              <span className="inline-flex items-center gap-1 text-foreground/45 transition-colors group-hover:text-primary">
                S’entraîner <ArrowRight className="size-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
