import type { Metadata } from "next";
import { currentUserId } from "@/lib/auth";
import { parisDay } from "@/lib/dates";
import { activity, getProgress, getSettings, lexiconCoverage, lexiconGrid, knownByMonth, levelLadder } from "@/lib/learn";
import { LevelLadder } from "@/components/level-ladder";
import { a1Themes, weekReport } from "@/lib/motivation";
import { KnownChart } from "@/components/known-chart";
import { LevelRequirements } from "@/components/level-requirements";
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
  const [p, act, settings, ladder, coverage, months] = await Promise.all([
    getProgress(userId),
    activity(userId),
    getSettings(userId),
    levelLadder(userId),
    lexiconCoverage(userId),
    knownByMonth(userId),
  ]);
  // Prochain niveau officiel (ni « − » ni « + ») : seuil tracé sur le graphique.
  const nextRung = ladder.find((r) => !/[+−]$/.test(r.code) && r.eta !== "atteint") ?? null;
  const focus = coverage.lexicons.find((l) => l.list === coverage.focus) ?? null;
  // Le tableau du haut suit le lexique du niveau en cours (A1, puis A2…), le dernier s'ils sont tous complets.
  const shown = focus ?? coverage.lexicons[coverage.lexicons.length - 1];
  const [grid, themes, week] = await Promise.all([
    lexiconGrid(userId, shown.list),
    shown.list === "a1" ? a1Themes(userId) : Promise.resolve([]),
    weekReport(userId),
  ]);
  // Thèmes les plus incomplets d'abord : là où sont les trous.
  const themesByGap = [...themes].sort((a, b) => a.known / a.size - b.known / b.size || b.size - a.size);
  const pct = Math.round((shown.known / shown.size) * 100);

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
            {shown.known}
            <span className="text-[24px] font-normal text-muted"> / {shown.size}</span>
          </p>
          <p className="text-muted">
            mots du {shown.label} connus ({pct} %), {shown.learning} en cours d’apprentissage. Niveau{" "}
            <span className="font-semibold text-ink">{p.level.code}</span> avec {p.knownAll} mots connus en tout.
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

      {themesByGap.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold">Lexique A1 par thèmes</h2>
          <p className="text-[15px] text-muted">Les groupes du lexique officiel, les plus incomplets d’abord : de petits objectifs à finir.</p>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {themesByGap.map((t) => {
              const done = t.known === t.size;
              return (
                <li key={t.id} className="space-y-1">
                  <span className="flex items-baseline justify-between gap-2 text-[15px]">
                    <span className={cn("min-w-0 truncate", done && "text-muted")}>{t.title}</span>
                    <span className={cn("shrink-0 tabular-nums", done ? "text-known" : "text-muted")}>
                      {done ? "✓ " : ""}
                      {t.known}/{t.size}
                    </span>
                  </span>
                  <span className="flex h-1.5 overflow-hidden rounded-full bg-[var(--cell-empty)]">
                    <span className="bg-known" style={{ width: `${(t.known / t.size) * 100}%` }} />
                    <span className="bg-learning" style={{ width: `${(t.learning / t.size) * 100}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[22px] font-semibold">Cette semaine</h2>
        <p className="text-[17px]">
          <span className="font-semibold tabular-nums">+{week.week}</span> mots connus en 7 jours, pour une moyenne de{" "}
          {Math.round(week.average)} par semaine depuis le début.
        </p>
        {week.target && (
          <p className={cn("text-[15px]", week.daysAhead >= 0 ? "text-known" : "text-wrong")}>
            {week.daysAhead === 0
              ? `Pile dans ton rythme : ${week.target.code} prévu le ${fmtDate(week.target.date)}.`
              : `${Math.abs(week.daysAhead)} jour${Math.abs(week.daysAhead) > 1 ? "s" : ""} ${week.daysAhead > 0 ? "d’avance" : "de retard"} gagné${Math.abs(week.daysAhead) > 1 ? "s" : ""} cette semaine sur ${week.target.code} (prévu le ${fmtDate(week.target.date)} au rythme moyen).`}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[22px] font-semibold">Mots connus, mois par mois</h2>
        <KnownChart
          points={months}
          lexicons={coverage.lexicons}
          next={nextRung && { code: nextRung.code, need: nextRung.need }}
          steps={ladder.filter((r) => nextRung && r.need <= nextRung.need).map((r) => ({ code: r.code, need: r.need }))}
          today={parisDay()}
        />
        {focus && (
          <p className="text-[17px]">
            En leçon, les mots nouveaux viennent du <span className="font-semibold">lexique {focus.code}</span> : il t’en
            manque {focus.size - focus.known} sur {focus.size}.
          </p>
        )}
        <p className="text-[14px] text-faint">
          Cumul à la fin de chaque mois, nouveaux mots du mois en dessous. Un mot appris en leçon devient connu après deux jours de révisions réussies.
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
          <p className="text-muted">Tous les paliers sont atteints.</p>
        )}
        <LevelLadder rungs={ladder} lexicons={coverage.lexicons} />
        <h3 className="pt-2 text-[19px] font-semibold">Ce qu’il faut maîtriser</h3>
        <LevelRequirements next={nextRung?.code ?? null} />
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
