import Link from "next/link";
import { progressTier } from "@/lib/game-levels";
import type { TypeProgress } from "@/lib/queries";

// Compact per-type progression on the home: one card per word type the user has collected,
// showing paradigm completion (declension/conjugation forms) with a coherent tier label.
export function HomeProgress({ rows }: { rows: TypeProgress[] }) {
  const shown = rows.filter((r) => r.words > 0 && r.formsTotal > 0);
  if (shown.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {shown.map((r) => (
        <Link
          key={r.type}
          href="/parcours"
          className="glass glass-lift rounded-2xl p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg">{r.label}</h3>
              <p className="text-xs text-foreground/50">
                {progressTier(r.formsPct)} · {r.words} mot{r.words > 1 ? "s" : ""}
              </p>
            </div>
            <span className="font-display text-xl text-primary">{Math.round(r.formsPct)}%</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${r.formsPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-foreground/40">
            {r.formsDiscovered}/{r.formsTotal} formes remplies
          </p>
        </Link>
      ))}
    </div>
  );
}
