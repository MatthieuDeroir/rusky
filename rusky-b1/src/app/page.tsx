import Link from "next/link";
import { currentUserId } from "@/lib/auth";
import { getProgress } from "@/lib/learn";
import { lessonsToday, NEW_PER_LESSON, REVIEW_TOTAL, suggestedSlot } from "@/lib/lessons";
import { LinkButton } from "@/components/ui";
import { LexiconBar } from "@/components/lexicon";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const fmtDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

export default async function TodayPage() {
  const userId = await currentUserId();
  const [lessons, progress] = await Promise.all([lessonsToday(userId), getProgress(userId)]);
  const next = suggestedSlot(lessons);
  const doneCount = lessons.filter((l) => l.done).length;
  const nextLesson = lessons.find((l) => l.slot === next);

  const detail = (l: (typeof lessons)[number]) => {
    if (l.done) return "faite";
    if (!l.started) return `${REVIEW_TOTAL} révisions, un texte connu, ${NEW_PER_LESSON} mots nouveaux`;
    const left = [!l.reviewsDone && "révisions", !l.knownRead && "texte connu", !l.newRead && "mots nouveaux"].filter(Boolean);
    return `en cours, reste : ${left.join(", ")}`;
  };

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="text-muted first-letter:uppercase">{fmtDay.format(new Date())}</p>
        <h1 className="text-[32px] leading-tight font-semibold">
          {doneCount === 3 ? "Les trois leçons sont faites." : doneCount > 0 ? `${doneCount} leçon${doneCount > 1 ? "s" : ""} sur 3` : "Tes trois leçons du jour"}
        </h1>
        {progress.streak > 0 && (
          <p className="text-muted">
            {progress.streak} jour{progress.streak > 1 ? "s" : ""} d’affilée
          </p>
        )}
      </header>

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
          <h2 className="text-[19px] font-semibold">Lexique B1</h2>
          <p className="text-muted tabular-nums">
            <span className="font-semibold text-ink">{progress.knownB1}</span> / {progress.b1Total} connus
          </p>
        </div>
        <LexiconBar known={progress.knownB1} learning={progress.learningB1} total={progress.b1Total} />
        <p className="text-[15px] text-muted">
          Niveau estimé <span className="font-semibold text-ink">{progress.level.code}</span>
          {progress.level.next && progress.level.missing[0] ? `, pour ${progress.level.next} : encore ${progress.level.missing[0]}.` : "."}
        </p>
      </section>
    </div>
  );
}
