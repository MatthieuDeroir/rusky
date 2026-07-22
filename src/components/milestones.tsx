import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { VOCAB_MILESTONES, reachedLevelIndex } from "@/lib/levels";

// Vocabulary level — based on the number of distinct lemmas collected. A level is *reached*
// by the word count but only becomes the displayed title once *validated* by a control test
// (words asked in acquisition order). Validated levels carry a green ✓.
export function Milestones({
  count,
  validatedLevel,
}: {
  count: number;
  validatedLevel: number; // highest validated index (-1 = none)
}) {
  const milestones = VOCAB_MILESTONES;
  const reachedIdx = reachedLevelIndex(milestones, count);
  const title = validatedLevel >= 0 ? milestones[validatedLevel].label : "Débutant";
  const next = milestones[reachedIdx + 1] ?? null;
  const from = reachedIdx >= 0 ? milestones[reachedIdx].n : 0;
  const pct = next ? Math.round(((count - from) / (next.n - from)) * 100) : 100;
  const toValidate = reachedIdx > validatedLevel ? validatedLevel + 1 : null;

  return (
    <section className="glass-strong rounded-3xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/45">Vocabulaire</div>
          <div className="font-display text-2xl">{title}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl text-primary">{count.toLocaleString("fr-FR")}</div>
          <div className="text-xs text-foreground/50">mots appris</div>
        </div>
      </div>

      {next && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-foreground/55">
            <span>{reachedIdx >= 0 ? milestones[reachedIdx].blurb : "Commence ta collection."}</span>
            <span>
              encore {(next.n - count).toLocaleString("fr-FR")} → {next.label}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500 transition-[width] duration-700"
              style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
            />
          </div>
        </div>
      )}

      {toValidate !== null && (
        <Link
          href="/controle/vocabulary"
          className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-amber-400/10 px-4 py-3 text-sm ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/20"
        >
          <span className="text-amber-100">
            Palier <span className="font-semibold">{milestones[toValidate].label}</span> atteint —
            passe le contrôle pour le valider.
          </span>
          <ChevronRight className="size-4 shrink-0 text-amber-200" />
        </Link>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {milestones.map((m, i) => {
          const validated = i <= validatedLevel;
          const reachedNotValidated = i > validatedLevel && i <= reachedIdx;
          return (
            <span
              key={m.n}
              title={m.blurb}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                validated
                  ? "bg-emerald-500/20 text-foreground ring-1 ring-emerald-400/50"
                  : reachedNotValidated
                    ? "bg-amber-400/10 text-amber-100 ring-1 ring-amber-400/30"
                    : "bg-white/5 text-foreground/40"
              }`}
            >
              {validated && <Check className="size-3 text-emerald-300" />}
              {m.n.toLocaleString("fr-FR")} · {m.label}
              {reachedNotValidated && <span className="text-amber-200/80">· à valider</span>}
            </span>
          );
        })}
      </div>
    </section>
  );
}
