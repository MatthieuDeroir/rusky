import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import {
  milestonesFor,
  reachedLevelIndex,
  TRACK_LABEL,
  TRACK_UNIT,
  type Track,
} from "@/lib/levels";

// Grammatical-completion card for one track. The gauge shows how complete the CURRENT
// collection's paradigms are (filled / total). A level is *reached* once enough cells are
// filled, but only becomes the displayed title once *validated* by a control test — reached
// but unvalidated levels show an "à valider" call-to-action; validated levels get a green ✓.
const BAR: Record<Track, string> = {
  declension: "from-primary to-emerald-500",
  conjugation: "from-primary to-sky-500",
};

export function CompletionProgress({
  track,
  filled,
  totalCells,
  validatedLevel,
}: {
  track: Track;
  filled: number;
  totalCells: number;
  validatedLevel: number; // highest validated milestone index (-1 = none)
}) {
  if (totalCells === 0) return null; // no word of this family collected yet → nothing to show

  const milestones = milestonesFor(track);
  const pct = Math.round((filled / totalCells) * 100);
  const reachedIdx = reachedLevelIndex(milestones, filled);
  const title = validatedLevel >= 0 ? milestones[validatedLevel].label : "Débutant";

  // The next level reached by cells but not yet validated → offer the control test.
  const toValidate = reachedIdx > validatedLevel ? validatedLevel + 1 : null;
  // The next level still to reach by filling more cells.
  const next = milestones[reachedIdx + 1] ?? null;

  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/45">
            {TRACK_LABEL[track]}
          </div>
          <div className="font-display text-2xl">{title}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl text-primary">{pct}%</div>
          <div className="text-xs text-foreground/50">
            {filled.toLocaleString("fr-FR")} / {totalCells.toLocaleString("fr-FR")}{" "}
            {TRACK_UNIT[track]}
          </div>
        </div>
      </div>

      {/* Global completion gauge for this family's cells in the current collection */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-foreground/55">
          <span>{milestones[Math.max(0, reachedIdx)]?.blurb ?? "Complète tes tableaux."}</span>
          {next && (
            <span>
              encore {(next.n - filled).toLocaleString("fr-FR")} → {next.label}
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${BAR[track]} transition-[width] duration-700`}
            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
          />
        </div>
      </div>

      {/* Call to action: a reached-but-unvalidated level can be confirmed by a control test. */}
      {toValidate !== null && (
        <Link
          href={`/controle/${track}`}
          className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-amber-400/10 px-4 py-3 text-sm ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/20"
        >
          <span className="text-amber-100">
            Palier <span className="font-semibold">{milestones[toValidate].label}</span> atteint
            — passe le contrôle pour le valider.
          </span>
          <ChevronRight className="size-4 shrink-0 text-amber-200" />
        </Link>
      )}

      {/* Milestones: ✓ validated · "à valider" reached-not-validated · dim locked */}
      <div className="mt-5 flex flex-wrap gap-2">
        {milestones.map((m, i) => {
          const validated = i <= validatedLevel;
          const reachedNotValidated = i > validatedLevel && i <= reachedIdx;
          return (
            <span
              key={m.n}
              title={`${m.n.toLocaleString("fr-FR")} ${TRACK_UNIT[track]} — ${m.blurb}`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                validated
                  ? "bg-emerald-500/20 text-foreground ring-1 ring-emerald-400/50"
                  : reachedNotValidated
                    ? "bg-amber-400/10 text-amber-100 ring-1 ring-amber-400/30"
                    : "bg-white/5 text-foreground/40"
              }`}
            >
              {validated && <Check className="size-3 text-emerald-300" />}
              {m.label}
              {reachedNotValidated && <span className="text-amber-200/80">· à valider</span>}
            </span>
          );
        })}
      </div>
    </section>
  );
}
