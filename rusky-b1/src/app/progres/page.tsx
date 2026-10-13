import type { Metadata } from "next";
import { currentUserId } from "@/lib/auth";
import { parisDay } from "@/lib/dates";
import { activity, getProgress, getSettings, lexiconGrid, knownByMonth } from "@/lib/learn";
import { KnownChart } from "@/components/known-chart";
import { LexiconGrid } from "@/components/lexicon";
import { SettingsForm } from "@/components/settings-form";
import { Reminders } from "@/components/reminders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Progrès" };

const fmtLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtDate = (d: string) => fmtLong.format(new Date(d + "T12:00:00Z"));

export default async function ProgressPage() {
  const userId = await currentUserId();
  const [p, grid, act, settings, months] = await Promise.all([
    getProgress(userId),
    lexiconGrid(userId),
    activity(userId),
    getSettings(userId),
    knownByMonth(userId),
  ]);
  const pct = Math.round((p.knownB1 / p.b1Total) * 100);

  // Projection honnête : au rythme des 7 derniers jours, quand le lexique sera-t-il bouclé ?
  const pace = p.pacePerDay.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  let verdict: { tone: "ok" | "late" | "none"; text: string };
  if (p.pacePerDay === 0) verdict = { tone: "none", text: "Pas encore assez d’activité cette semaine pour projeter une date." };
  else if (p.examDate && p.projectedDate && p.projectedDate > p.examDate)
    verdict = {
      tone: "late",
      text: `Au rythme actuel (${pace} nouveaux mots par jour), le lexique serait bouclé le ${fmtDate(p.projectedDate)}, après l’examen. Il faudrait ${p.neededPerDay} mots par jour.`,
    };
  else
    verdict = {
      tone: "ok",
      text: `Au rythme actuel (${pace} nouveaux mots par jour), le lexique sera bouclé le ${p.projectedDate ? fmtDate(p.projectedDate) : "—"}${p.examDate ? ", avant l’examen" : ""}.`,
    };

  // Calendrier : 10 semaines, lundi en haut.
  const counts = new Map(act.map((a) => [a.day, a.total]));
  const today = new Date();
  const offset = (today.getDay() + 6) % 7; // 0 = lundi
  const days: { day: string; n: number }[] = [];
  for (let i = 69 + offset; i >= 0; i--) {
    const d = parisDay(new Date(today.getTime() - i * 86_400_000));
    days.push({ day: d, n: counts.get(d) ?? 0 });
  }

  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <h1 className="text-[32px] font-semibold">Progrès</h1>
        <div className="space-y-1">
          <p className="text-[56px] leading-none font-semibold tabular-nums">
            {p.knownB1}
            <span className="text-[24px] font-normal text-muted"> / {p.b1Total}</span>
          </p>
          <p className="text-muted">
            mots du lexique B1 connus ({pct} %), {p.learningB1} en cours d’apprentissage
          </p>
        </div>
        <LexiconGrid states={grid.states} />
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[2px] bg-known" /> connu</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[2px] bg-learning" /> en cours</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[2px] bg-[var(--cell-empty)]" /> à venir</span>
          <span>Une case par mot, des plus fréquents aux plus rares.</span>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">Mots du lexique B1 connus, mois par mois</h2>
        <KnownChart points={months} target={p.b1Total} today={parisDay()} examDate={p.examDate} />
        <p className="text-[14px] text-faint">
          Cumul à la fin de chaque mois. Un mot appris en leçon devient connu après deux jours de révisions réussies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">Niveau estimé : {p.level.code}</h2>
        {p.level.next ? (
          <div className="text-muted">
            <p>Pour atteindre {p.level.next}, il manque :</p>
            <ul className="mt-1 list-disc pl-5">
              {p.level.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">Le vocabulaire et la lecture sont au niveau B1.</p>
        )}
        <p className="text-[14px] text-faint">
          Estimation à partir du vocabulaire B1 connu et des réponses aux questions de lecture (30 derniers jours). Le ТРКИ-1
          comporte aussi l’écoute, l’écrit et l’oral.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">
          {p.daysToExam !== null && p.daysToExam > 0 ? `Examen dans ${p.daysToExam} jours` : "Date de l’examen"}
        </h2>
        <p className={cn(verdict.tone === "late" ? "text-wrong" : "text-muted")}>{verdict.text}</p>
        <SettingsForm examDate={settings.examDate} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">Rappels</h2>
        <Reminders />
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">Lecture</h2>
        <p className="text-muted">
          {p.reading30 === null
            ? "Pas encore de questions de lecture ces 30 derniers jours."
            : `${Math.round(p.reading30 * 100)} % de bonnes réponses sur ${p.readingAnswers30} questions (30 jours). Le seuil de l’examen est d’environ 66 %.`}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">Régularité</h2>
        <p className="text-muted">
          {p.streak > 0 ? `${p.streak} jour${p.streak > 1 ? "s" : ""} d’affilée.` : "Pas de série en cours."} Dix dernières semaines :
        </p>
        <div className="grid grid-flow-col grid-rows-7 justify-start gap-[4px]" role="img" aria-label="Calendrier d’activité">
          {days.map((d) => (
            <span
              key={d.day}
              title={`${d.day} : ${d.n}`}
              className={cn(
                "size-[15px] rounded-[3px]",
                d.n === 0 ? "bg-[var(--cell-empty)]" : d.n < 15 ? "bg-known/35" : d.n < 40 ? "bg-known/65" : "bg-known",
              )}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
