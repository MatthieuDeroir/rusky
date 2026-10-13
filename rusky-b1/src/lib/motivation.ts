import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { LEVELS } from "@/lib/learn";
import { NEW_PER_LESSON, SLOTS } from "@/lib/lessons";
import themes from "@/lib/a1-themes.json";
import { analysisCoverage, familiarEntryIds } from "@/lib/coverage";
import type { ReaderAnalysis } from "@/lib/reader/types";

const DAY_MS = 86_400_000;
/** Mots nouveaux par jour quand les trois leçons sont faites. */
export const WORDS_PER_FULL_DAY = NEW_PER_LESSON * SLOTS.length;

function addDays(day: string, n: number): string {
  return parisDay(new Date(Date.parse(day + "T12:00:00Z") + n * DAY_MS));
}

/** Rythme moyen observé (tous les mots connus par jour), depuis le premier mot daté. */
async function knownPace(userId: string) {
  const words = await prisma.word.findMany({ where: { userId, status: "KNOWN" }, select: { knownAt: true } });
  const dates = words.filter((w) => w.knownAt).map((w) => w.knownAt!.getTime());
  const first = dates.length ? Math.min(...dates) : Date.now();
  const days = Math.max(1, (Date.now() - first) / DAY_MS);
  return { known: words.length, perDay: words.length / days, dates };
}

export interface StepGoal {
  code: string;
  need: number;
  missing: number;
  /** Date en faisant les trois leçons chaque jour (30 mots nouveaux par jour). */
  atLessons: string;
  /** Date au rythme moyen observé (null : pas encore de rythme). */
  atPace: string | null;
}

/** Objectif du jour : le prochain palier (− et + compris) et quand l'atteindre. */
export async function nextStepGoal(userId: string): Promise<StepGoal | null> {
  const { known, perDay } = await knownPace(userId);
  const next = LEVELS.find((l) => l.need > known);
  if (!next) return null;
  const missing = next.need - known;
  const today = parisDay();
  return {
    code: next.code,
    need: next.need,
    missing,
    atLessons: addDays(today, Math.ceil(missing / WORDS_PER_FULL_DAY)),
    atPace: perDay > 0 ? addDays(today, Math.ceil(missing / perDay)) : null,
  };
}

export interface WeekReport {
  /** Mots devenus connus ces 7 derniers jours. */
  week: number;
  /** Ce qu'une semaine moyenne apporte (rythme depuis le début). */
  average: number;
  /** Jours d'avance (+) ou de retard (−) gagnés cette semaine sur la date du prochain niveau. */
  daysAhead: number;
  /** Prochain niveau officiel visé et sa date au rythme moyen. */
  target: { code: string; date: string } | null;
}

/** Cette semaine face à la moyenne : le seul classement qui compte, contre soi-même. */
export async function weekReport(userId: string): Promise<WeekReport> {
  const { known, perDay, dates } = await knownPace(userId);
  const since = Date.now() - 7 * DAY_MS;
  const week = dates.filter((d) => d >= since).length;
  const average = perDay * 7;
  const target = LEVELS.find((l) => !/[+−]$/.test(l.code) && l.need > known);
  return {
    week,
    average,
    daysAhead: perDay > 0 ? Math.round((week - average) / perDay) : 0,
    target: target && perDay > 0 ? { code: target.code, date: addDays(parisDay(), Math.ceil((target.need - known) / perDay)) } : null,
  };
}

export interface ThemeCoverage {
  id: string;
  title: string;
  size: number;
  known: number;
  learning: number;
}

/** Le lexique A1 par thèmes (groupes du lexique officiel) : où sont les trous. */
export async function a1Themes(userId: string): Promise<ThemeCoverage[]> {
  const words = await prisma.word.findMany({
    where: { userId, entry: { inA1Minimum: true } },
    select: { status: true, entry: { select: { bare: true } } },
  });
  const status = new Map(words.map((w) => [w.entry.bare, w.status]));
  return (themes as { id: string; title: string; words: string[] }[]).map((t) => ({
    id: t.id,
    title: t.title,
    size: t.words.length,
    known: t.words.filter((w) => status.get(w) === "KNOWN").length,
    learning: t.words.filter((w) => status.get(w) === "LEARNING").length,
  }));
}

export interface FullDays {
  /** Jours d'affilée avec les trois leçons faites (un joker par semaine). */
  streak: number;
  /** Jokers utilisés dans la série. */
  jokers: number;
  /** Les trois leçons sont-elles faites aujourd'hui ? */
  today: boolean;
}

/** Série honnête : jours où les trois leçons sont faites. Un jour manqué par semaine (lundi →
 * dimanche) est couvert par un joker sans casser la série ; aujourd'hui ne compte que s'il est
 * complet (il ne casse rien tant qu'il n'est pas fini). */
export async function fullDayStreak(userId: string): Promise<FullDays> {
  const rows = await prisma.lesson.findMany({ where: { userId, completedAt: { not: null } }, select: { day: true } });
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
  const full = (d: string) => (perDay.get(d) ?? 0) >= SLOTS.length;
  const firstDay = [...perDay.keys()].sort()[0];
  const today = parisDay();
  if (!firstDay) return { streak: 0, jokers: 0, today: false };
  const week = (d: string) => {
    const dt = new Date(d + "T12:00:00Z");
    return parisDay(new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * DAY_MS)); // lundi
  };
  let streak = full(today) ? 1 : 0;
  let jokers = 0;
  // Joker en attente : il ne compte que s'il relie à un jour complet plus ancien.
  let pending = 0;
  const usedWeeks = new Set<string>();
  for (let d = addDays(today, -1); d >= firstDay; d = addDays(d, -1)) {
    if (full(d)) {
      streak++;
      jokers += pending;
      pending = 0;
      continue;
    }
    // Un joker ne sert qu'à relier deux jours complets : pas de série, rien à protéger.
    if (streak === 0 || pending > 0 || usedWeeks.has(week(d))) break;
    usedWeeks.add(week(d));
    pending = 1;
  }
  return { streak, jokers, today: full(today) };
}

/** Textes à relire : lus il y a plus de 4 semaines, avec la part de mots connus alors et
 * maintenant — la preuve que le vocabulaire a changé la lecture. */
export async function rereadSuggestions(userId: string, limit = 3) {
  const cutoff = new Date(Date.now() - 28 * DAY_MS);
  const done = await prisma.textProgress.findMany({
    where: { userId, completedAt: { lt: cutoff }, text: { analysis: { not: null } } },
    orderBy: { completedAt: "asc" },
    take: limit,
    select: { completedAt: true, text: { select: { id: true, title: true, analysis: true } } },
  });
  if (done.length === 0) return [];
  const now = await familiarEntryIds(userId);
  const pct = (c: { known: number; total: number }) => (c.total ? Math.round((c.known / c.total) * 100) : 0);
  return Promise.all(
    done.map(async (d) => {
      const analysis = JSON.parse(d.text.analysis!) as ReaderAnalysis;
      const then = await familiarEntryIds(userId, { asOf: d.completedAt! });
      return {
        id: d.text.id,
        title: d.text.title,
        readOn: d.completedAt!,
        then: pct(analysisCoverage(analysis, then)),
        now: pct(analysisCoverage(analysis, now)),
      };
    }),
  );
}
