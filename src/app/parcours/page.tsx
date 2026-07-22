import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { currentUserId } from "@/lib/auth";
import { getTypeProgress } from "@/lib/queries";
import { progressTier } from "@/lib/game-levels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parcours · Русский" };

// Coverage type → the Exercices browser's type key, so a card opens straight onto that type.
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
  const rows = await getTypeProgress(userId);

  const collected = rows.reduce((s, r) => s + r.vocabCollected, 0);
  const total = rows.reduce((s, r) => s + r.vocabTotal, 0);
  const overallPct = total > 0 ? Math.round((collected / total) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-3xl">Parcours</h1>
        <p className="mt-1 text-sm text-foreground/55">
          Deux mesures par nature de mot : la part du dictionnaire déjà rencontrée, et la
          complétion des déclinaisons / conjugaisons de tes mots.
        </p>
      </div>

      {/* Overall dictionary coverage */}
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

      {/* Per-type coverage */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const formsLabel = r.type === "verb" ? "Conjugaison" : "Déclinaison";
          const hasForms = r.words > 0 && r.formsTotal > 0;
          return (
            <Link
              key={r.type}
              href={`/exercices?type=${EX_TYPE[r.type] ?? ""}`}
              className="glass glass-lift group flex flex-col rounded-2xl p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl">{r.label}</h2>
                <span className="inline-flex items-center gap-1 text-xs text-foreground/45 transition-colors group-hover:text-primary">
                  S’entraîner <ArrowRight className="size-3.5" />
                </span>
              </div>

              {/* Dictionary coverage */}
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-xs text-foreground/55">
                  <span>Dictionnaire</span>
                  <span className="tabular-nums text-foreground/70">{r.vocabPct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(r.vocabPct, r.vocabCollected > 0 ? 1 : 0)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-foreground/40">
                  {r.vocabCollected.toLocaleString("fr")} / {r.vocabTotal.toLocaleString("fr")} mots
                </p>
              </div>

              {/* Paradigm completion (declension / conjugation) */}
              {hasForms && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="flex items-baseline justify-between text-xs text-foreground/55">
                    <span>
                      {formsLabel} · {progressTier(r.formsPct)}
                    </span>
                    <span className="tabular-nums text-primary">{Math.round(r.formsPct)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${r.formsPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-foreground/40">
                    {r.formsDiscovered}/{r.formsTotal} formes de tes {r.words} mot
                    {r.words > 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
