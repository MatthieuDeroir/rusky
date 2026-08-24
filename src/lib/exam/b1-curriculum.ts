// Parcours vocabulaire quotidien (§L du plan, révisé après retour utilisateur) : cohortes de 20
// mots/jour tirées du minimum B1 (DictionaryEntry.inB1Minimum), regroupées par "famille" (mots
// partageant le même bare — homonymes, jamais coupés entre deux jours) et ordonnées par un
// tirage pseudo-aléatoire seedé sur l'utilisateur (pas alphabétique).
//
// Un jour n'est "acquis" que lorsque CHAQUE mot a été validé par un test de traduction réussi
// (dernière tentative `vocab:ru-fr` correcte) — pas simplement "vu" (Encounter). Le calendrier
// avance tout seul (1 jour programmé = 1 jour civil écoulé depuis le tout premier jour) : si des
// jours sont manqués sans être validés, ils s'accumulent dans le pool "Nouveaux" au lieu d'être
// sautés ou de bloquer indéfiniment.

import { prisma } from "@/lib/db";
import { makeRng, seededShuffle } from "./rng";

const COHORT_SIZE = 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface B1Family {
  bare: string;
  entryIds: number[];
}

async function getB1Families(): Promise<B1Family[]> {
  const entries = await prisma.dictionaryEntry.findMany({
    where: { inB1Minimum: true },
    select: { id: true, bare: true },
    orderBy: { id: "asc" },
  });
  const byBare = new Map<string, number[]>();
  for (const e of entries) {
    const arr = byBare.get(e.bare) ?? [];
    arr.push(e.id);
    byBare.set(e.bare, arr);
  }
  return [...byBare.entries()].map(([bare, entryIds]) => ({ bare, entryIds }));
}

/** Empile les familles dans des cohortes de taille visée (20), sans jamais en couper une en
 * deux — une cohorte peut donc dépasser légèrement 20 quand une famille compte plusieurs entrées. */
function packCohorts(families: B1Family[]): number[][] {
  const cohorts: number[][] = [];
  let current: number[] = [];
  for (const fam of families) {
    if (current.length > 0 && current.length + fam.entryIds.length > COHORT_SIZE) {
      cohorts.push(current);
      current = [];
    }
    current.push(...fam.entryIds);
  }
  if (current.length > 0) cohorts.push(current);
  return cohorts;
}

/** Ordre stable pour un utilisateur donné : recalculé à l'identique à chaque appel (pas besoin
 * de persister la permutation), seedé sur son id. */
async function buildAllCohorts(userId: string): Promise<number[][]> {
  const families = await getB1Families();
  const rng = makeRng(`b1-curriculum:${userId}`);
  return packCohorts(seededShuffle(families, rng));
}

/** "Maîtrisé" = la dernière tentative de traduction ru→fr (`vocab:ru-fr`) sur ce mot est
 * correcte — pas juste "vu". Autorise le classique "dernière tentative gagne" déjà utilisé
 * ailleurs dans l'app (getVocabCardAction mistakesOnly, getMistakeCardAction). */
async function getMasteredEntryIds(userId: string, entryIds: number[]): Promise<Set<number>> {
  if (entryIds.length === 0) return new Set();
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, entryId: { in: entryIds }, formKey: "vocab:ru-fr" },
    orderBy: { createdAt: "desc" },
    select: { entryId: true, correct: true },
  });
  const latest = new Map<number, boolean>();
  for (const a of attempts) {
    if (a.entryId != null && !latest.has(a.entryId)) latest.set(a.entryId, a.correct);
  }
  return new Set(entryIds.filter((id) => latest.get(id) === true));
}

async function getIntroducedEntryIds(userId: string, entryIds: number[]): Promise<Set<number>> {
  if (entryIds.length === 0) return new Set();
  const enc = await prisma.encounter.findMany({
    where: { userId, entryId: { in: entryIds } },
    select: { entryId: true },
    distinct: ["entryId"],
  });
  return new Set(enc.map((e) => e.entryId!));
}

export interface B1State {
  scheduledDayIndex: number;
  totalDays: number;
  /** Mots pas encore rencontrés du tout, dans les jours dus (aujourd'hui + retard éventuel). */
  nouveauxToIntroduce: number[];
  /** Mots déjà rencontrés mais pas encore maîtrisés, dans les jours dus (hors "hier" séparé). */
  nouveauxToTest: number[];
  dayIndex: number | null; // le(s) jour(s) "hier" concerné, ou null si aucun
  hierToIntroduce: number[]; // normalement vide — filet de sécurité
  hierToTest: number[];
  /** Mots déjà maîtrisés et plus vieux que "hier" — pratique libre, sans fin. */
  mixEntryIds: number[];
}

/** Calcule l'état courant du parcours pour un utilisateur : ce qui est dû aujourd'hui (avec le
 * retard éventuel accumulé), ce qui relève de "hier", et ce qui est déjà acquis (mélange). Tout
 * est recalculé à chaque appel depuis Encounter/QuizAttempt — aucun état "jour validé" n'est mis
 * en cache, donc rien ne peut rester figé sur une valeur périmée. */
export async function getB1State(userId: string): Promise<B1State | null> {
  const cohorts = await buildAllCohorts(userId);
  if (cohorts.length === 0) return null;

  let day0 = await prisma.b1VocabDay.findUnique({
    where: { userId_dayIndex: { userId, dayIndex: 0 } },
  });
  if (!day0) {
    day0 = await prisma.b1VocabDay.create({
      data: { userId, dayIndex: 0, entryIds: JSON.stringify(cohorts[0]), introducedAt: new Date() },
    });
  }
  const epoch = (day0.introducedAt ?? new Date()).getTime();
  const scheduledDayIndex = Math.min(
    cohorts.length - 1,
    Math.floor((Date.now() - epoch) / ONE_DAY_MS),
  );

  for (let d = 1; d <= scheduledDayIndex; d++) {
    const exists = await prisma.b1VocabDay.findUnique({
      where: { userId_dayIndex: { userId, dayIndex: d } },
    });
    if (!exists) {
      await prisma.b1VocabDay.create({
        data: { userId, dayIndex: d, entryIds: JSON.stringify(cohorts[d]), introducedAt: new Date() },
      });
    }
  }

  interface DueDay {
    dayIndex: number;
    entryIds: number[];
    mastered: Set<number>;
    introduced: Set<number>;
  }
  const dueDays: DueDay[] = [];
  for (let d = 0; d <= scheduledDayIndex; d++) {
    const entryIds = cohorts[d];
    const mastered = await getMasteredEntryIds(userId, entryIds);
    if (mastered.size < entryIds.length) {
      const introduced = await getIntroducedEntryIds(userId, entryIds);
      dueDays.push({ dayIndex: d, entryIds, mastered, introduced });
    }
  }

  // "Hier" = le jour programmé juste avant aujourd'hui, uniquement s'il a déjà été entamé (sinon
  // c'est du retard pur et simple, qui reste dans "Nouveaux" en attendant d'être introduit).
  const yesterdayIndex = scheduledDayIndex - 1;
  const hier = dueDays.find((d) => d.dayIndex === yesterdayIndex && d.introduced.size > 0) ?? null;

  const nouveauxDays = dueDays.filter((d) => d.dayIndex !== hier?.dayIndex);
  const nouveauxToIntroduce = nouveauxDays.flatMap((d) =>
    d.entryIds.filter((id) => !d.introduced.has(id)),
  );
  const nouveauxToTest = nouveauxDays.flatMap((d) =>
    d.entryIds.filter((id) => d.introduced.has(id) && !d.mastered.has(id)),
  );

  const hierToIntroduce = hier ? hier.entryIds.filter((id) => !hier.introduced.has(id)) : [];
  const hierToTest = hier
    ? hier.entryIds.filter((id) => hier.introduced.has(id) && !hier.mastered.has(id))
    : [];

  // Mélange : tout ce qui est maîtrisé, dans les jours strictement plus anciens que "hier" (ou
  // que le jour du jour, s'il n'y a pas encore de "hier" distinct).
  const mixCutoff = hier?.dayIndex ?? scheduledDayIndex;
  const mixRows = await prisma.b1VocabDay.findMany({
    where: { userId, dayIndex: { lt: mixCutoff } },
    select: { entryIds: true },
  });
  const mixCandidates = mixRows.flatMap((r) => JSON.parse(r.entryIds) as number[]);
  const mixMastered = await getMasteredEntryIds(userId, mixCandidates);

  return {
    scheduledDayIndex,
    totalDays: cohorts.length,
    nouveauxToIntroduce,
    nouveauxToTest,
    dayIndex: hier?.dayIndex ?? null,
    hierToIntroduce,
    hierToTest,
    mixEntryIds: [...mixMastered],
  };
}
