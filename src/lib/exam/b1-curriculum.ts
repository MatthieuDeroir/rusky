// Parcours vocabulaire quotidien (§L du plan) : cohortes de 20 mots/jour tirées du minimum B1
// (DictionaryEntry.inB1Minimum), regroupées par "famille" (mots partageant le même bare —
// homonymes/plusieurs classes grammaticales pour une même forme, jamais coupés entre deux jours)
// et ordonnées par un tirage pseudo-aléatoire seedé sur l'utilisateur (pas alphabétique : l'ordre
// du dictionnaire regroupe des mots proches orthographiquement, source d'interférence à la
// mémorisation — voir la décision actée dans le plan).
//
// Les mots ne sont "programmés" qu'ici (via B1VocabDay) — les introduire réellement (créer
// l'Encounter qui les fait entrer dans la collection/le SRS) reste un geste explicite de
// l'utilisateur (§ objectif-b1/actions.ts, introduceB1WordAction), jamais automatique.

import { prisma } from "@/lib/db";
import { makeRng, seededShuffle } from "./rng";

const COHORT_SIZE = 20;

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
 * de persister la permutation), seedé sur son id pour qu'un autre utilisateur ait un ordre
 * différent sans que ça change quoi que ce soit à l'algorithme. */
async function buildAllCohorts(userId: string): Promise<number[][]> {
  const families = await getB1Families();
  const rng = makeRng(`b1-curriculum:${userId}`);
  return packCohorts(seededShuffle(families, rng));
}

async function getHighestIntroducedDay(userId: string): Promise<number> {
  const last = await prisma.b1VocabDay.findFirst({
    where: { userId, introducedAt: { not: null } },
    orderBy: { dayIndex: "desc" },
    select: { dayIndex: true },
  });
  return last?.dayIndex ?? -1;
}

async function isCohortComplete(userId: string, entryIds: number[]): Promise<boolean> {
  if (entryIds.length === 0) return true;
  const encountered = await prisma.encounter.findMany({
    where: { userId, entryId: { in: entryIds } },
    select: { entryId: true },
    distinct: ["entryId"],
  });
  return new Set(encountered.map((e) => e.entryId)).size >= entryIds.length;
}

export interface B1DayCohort {
  dayIndex: number;
  entryIds: number[];
  totalDays: number;
}

/** Cohorte du jour courant pour cet utilisateur, en avançant paresseusement au jour suivant si
 * la cohorte en cours est déjà complète (chaque mot a au moins un Encounter). Crée la ligne
 * B1VocabDay du jour 0 au tout premier appel. Renvoie null si le minimum B1 est vide en base
 * (import pas encore lancé). */
export async function getTodayCohort(userId: string): Promise<B1DayCohort | null> {
  const cohorts = await buildAllCohorts(userId);
  if (cohorts.length === 0) return null;

  const highest = await getHighestIntroducedDay(userId);
  if (highest === -1) {
    await prisma.b1VocabDay.create({
      data: { userId, dayIndex: 0, entryIds: JSON.stringify(cohorts[0]), introducedAt: new Date() },
    });
    return { dayIndex: 0, entryIds: cohorts[0], totalDays: cohorts.length };
  }

  const row = await prisma.b1VocabDay.findUnique({
    where: { userId_dayIndex: { userId, dayIndex: highest } },
  });
  const entryIds = row?.entryIds ? (JSON.parse(row.entryIds) as number[]) : cohorts[highest];

  if (highest + 1 < cohorts.length && (await isCohortComplete(userId, entryIds))) {
    const dayIndex = highest + 1;
    await prisma.b1VocabDay.create({
      data: { userId, dayIndex, entryIds: JSON.stringify(cohorts[dayIndex]), introducedAt: new Date() },
    });
    return { dayIndex, entryIds: cohorts[dayIndex], totalDays: cohorts.length };
  }

  return { dayIndex: highest, entryIds, totalDays: cohorts.length };
}

/** Cohorte de la veille (jour courant - 1), ou null si l'utilisateur n'a pas encore de jour 1. */
export async function getYesterdayEntryIds(userId: string): Promise<number[] | null> {
  const highest = await getHighestIntroducedDay(userId);
  if (highest <= 0) return null;
  const row = await prisma.b1VocabDay.findUnique({
    where: { userId_dayIndex: { userId, dayIndex: highest - 1 } },
  });
  return row?.entryIds ? (JSON.parse(row.entryIds) as number[]) : null;
}

/** Union de tous les jours strictement antérieurs à hier (pour ne pas faire doublon avec l'onglet
 * "Hier"). Vide tant qu'il n'y a pas au moins 2 jours déjà introduits. */
export async function getMixEntryIds(userId: string): Promise<number[]> {
  const highest = await getHighestIntroducedDay(userId);
  if (highest <= 1) return [];
  const rows = await prisma.b1VocabDay.findMany({
    where: { userId, dayIndex: { lt: highest - 1 } },
    select: { entryIds: true },
  });
  const ids = new Set<number>();
  for (const r of rows) for (const id of JSON.parse(r.entryIds) as number[]) ids.add(id);
  return [...ids];
}
