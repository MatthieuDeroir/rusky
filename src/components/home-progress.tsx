import Link from "next/link";
import { progressTier } from "@/lib/game-levels";
import type { TypeProgress } from "@/lib/queries";

const BOUNDARIES = [25, 50, 75, 100];

// Compact per-type progression with a visible, coherent tier (palier) headline per word type —
// paradigm completion (declension / conjugation) of the user's collected words.
export function HomeProgress({ rows }: { rows: TypeProgress[] }) {
  const shown = rows.filter((r) => r.words > 0 && r.formsTotal > 0);
  if (shown.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {shown.map((r) => {
        const tier = progressTier(r.formsPct);
        const nextBoundary = BOUNDARIES.find((b) => b > r.formsPct);
        const toNext = nextBoundary
          ? Math.max(1, Math.ceil((nextBoundary / 100) * r.formsTotal) - r.formsDiscovered)
          : 0;
        const nextTier = nextBoundary ? progressTier(nextBoundary) : null;

        return (
          <Link key={r.type} href="/parcours" className="glass glass-lift rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
                  {r.label}
                </p>
                <h3 className="mt-0.5 truncate font-display text-xl">{tier}</h3>
              </div>
              <span className="font-display text-2xl text-primary">{Math.round(r.formsPct)}%</span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${r.formsPct}%` }}
              />
            </div>

            <p className="mt-1.5 text-[11px] text-foreground/45">
              {r.formsDiscovered}/{r.formsTotal} formes
              {nextTier ? ` · encore ${toNext} → ${nextTier}` : " · complet 🎉"}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
