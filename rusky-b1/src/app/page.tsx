import Link from "next/link";
import { currentUserId } from "@/lib/auth";
import { getProgress, lexiconCoverage } from "@/lib/learn";
import { fullDayStreak, nextStepGoal, weekReport } from "@/lib/motivation";
import { currentPlan } from "@/lib/memory";
import { lessonsToday, suggestedSlot } from "@/lib/lessons";
import { LinkButton } from "@/components/ui";
import { LexiconBar } from "@/components/lexicon";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const fmtShortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const fmtShort = (d: string) => fmtShortDay.format(new Date(d + "T12:00:00Z"));
const fmtDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

export default async function TodayPage() {
  const userId = await currentUserId();
  const [lessons, progress, coverage, goal, week, full] = await Promise.all([
    lessonsToday(userId),
    getProgress(userId),
    lexiconCoverage(userId),
    nextStepGoal(userId),
    weekReport(userId),
    fullDayStreak(userId),
  ]);
  const plan = await currentPlan(userId);
  // Le lexique du niveau en cours (A1, puis A2…), le dernier s'ils sont tous complets.
  const shown = coverage.lexicons.find((l) => l.list === coverage.focus) ?? coverage.lexicons[coverage.lexicons.length - 1];
  const next = suggestedSlot(lessons);
  const doneCount = lessons.filter((l) => l.done).length;
  const nextLesson = lessons.find((l) => l.slot === next);

  const detail = (l: (typeof lessons)[number]) => {
    if (l.done) return "faite";
    if (!l.started)
      return `${plan.reviewLearned + plan.reviewLearning} révisions, puis un texte (95 % de mots connus, ${plan.newPerLesson} nouveaux soulignés)`;
    const left = [!l.reviewsDone && "révisions", !l.newRead && "texte"].filter(Boolean);
    return `en cours, reste : ${left.join(", ")}`;
  };

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="text-muted first-letter:uppercase">{fmtDay.format(new Date())}</p>
        <h1 className="text-[32px] leading-tight font-semibold">
          {doneCount === 3 ? "Les trois leçons sont faites." : doneCount > 0 ? `${doneCount} leçon${doneCount > 1 ? "s" : ""} sur 3` : "Tes trois leçons du jour"}
        </h1>
        {(progress.streak > 0 || full.streak > 0) && (
          <p className="text-muted">
            {full.streak > 0
              ? `${full.streak} jour${full.streak > 1 ? "s" : ""} complet${full.streak > 1 ? "s" : ""} d’affilée (3 leçons)${full.jokers ? `, ${full.jokers} joker${full.jokers > 1 ? "s" : ""} utilisé${full.jokers > 1 ? "s" : ""}` : ""}`
              : `${progress.streak} jour${progress.streak > 1 ? "s" : ""} d’affilée`}
          </p>
        )}
      </header>

      {goal && (
        <section className="space-y-1 rounded-2xl bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <p className="text-[17px]">
            <span className="font-semibold text-cobalt">{goal.code}</span> dans{" "}
            <span className="font-semibold tabular-nums">{goal.missing}</span> mot{goal.missing > 1 ? "s" : ""} : avec les 3
            leçons chaque jour ({goal.perFullDay} mots), le <span className="font-semibold">{fmtShort(goal.atLessons)}</span>.
          </p>
          <p className="text-[15px] text-muted">
            {goal.atPace ? `À ton rythme moyen : le ${fmtShort(goal.atPace)}.` : ""}{" "}
            Cette semaine : +{week.week} mots (moyenne {Math.round(week.average)})
            {week.target && week.daysAhead !== 0
              ? `, soit ${Math.abs(week.daysAhead)} jour${Math.abs(week.daysAhead) > 1 ? "s" : ""} ${week.daysAhead > 0 ? "d’avance" : "de retard"} sur ${week.target.code}.`
              : "."}
          </p>
        </section>
      )}

      <section className="space-y-6">
        <ol className="space-y-1">
          {lessons.map((l) => (
            <li key={l.slot}>
              <Link
                href={l.done ? "/" : `/seance?lecon=${l.slot}`}
                aria-disabled={l.done}
                className={cn("flex items-center gap-4 rounded-2xl px-1 py-2", !l.done && "hover:bg-sunk", l.done && "pointer-events-none")}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold",
                    l.done
                      ? "bg-known text-white dark:text-[#06150d]"
                      : l.slot === next
                        ? "bg-cobalt text-white"
                        : "bg-surface shadow-[inset_0_0_0_1px_var(--line)]",
                  )}
                  aria-hidden
                >
                  {l.done ? "✓" : l.label[0]}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[19px] font-medium", l.done && "text-muted line-through decoration-1")}>{l.label}</span>
                  <span className="block text-[15px] text-muted">{detail(l)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>

        {nextLesson ? (
          <LinkButton href={`/seance?lecon=${nextLesson.slot}`} size="lg" className="w-full sm:w-auto">
            {nextLesson.started ? `Reprendre la leçon ${nextLesson.of}` : `Commencer la leçon ${nextLesson.of}`}
          </LinkButton>
        ) : (
          <div className="space-y-3">
            <p className="text-[17px]">Bravo. Pour aller plus loin, un texte de plus dans l’onglet Lire.</p>
            <LinkButton href="/lire" size="lg" variant="secondary" className="w-full sm:w-auto">
              Lire un texte
            </LinkButton>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[19px] font-semibold first-letter:uppercase">{shown.label}</h2>
          <p className="text-muted tabular-nums">
            <span className="font-semibold text-ink">{shown.known}</span> / {shown.size} connus
          </p>
        </div>
        <LexiconBar known={shown.known} learning={shown.learning} total={shown.size} />
        <p className="text-[15px] text-muted">
          Niveau estimé <span className="font-semibold text-ink">{progress.level.code}</span> ({progress.knownAll} mots
          connus)
          {progress.level.next && progress.level.missing[0] ? `, pour ${progress.level.next} : encore ${progress.level.missing[0]}.` : "."}
        </p>
      </section>
    </div>
  );
}
