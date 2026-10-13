import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { review, nextDueDate, INITIAL_STATE, type Rating, type SrsState } from "@/lib/srs";

/** Un mot devient « connu » quand il a été réussi sur au moins 2 jours différents. */
export const KNOWN_AFTER_REPS = 2;
/** Mot déclaré connu au tri : vérifié par une révision dans une semaine. */
const TRIAGE_CHECK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface Card {
  entryId: number;
  ru: string; // accentué, prêt à afficher (accent combinant)
  type: string;
  aspect: string | null;
  gender: string | null;
  gloss: string;
  exampleRu: string | null;
  exampleFr: string | null;
  context: string | null;
  /** 'new' = première rencontre (tri) ; 'review' = mot déjà en cours / connu. */
  kind: "new" | "review";
  status?: string;
}

/** Accent tonique : l'apostrophe du dictionnaire devient un accent aigu combinant. */
export function accent(s: string): string {
  return s.replace(/'/g, "́");
}

/** Sens court : la carte vérifiée si elle existe, sinon les 3 premiers sens du dictionnaire. */
export function shortGloss(e: { glossFr: string | null; translationsFr: string | null; translationsEn: string | null }) {
  if (e.glossFr) return e.glossFr;
  const raw = e.translationsFr || e.translationsEn || "";
  return raw.split(/[,;/]/).map((x) => x.trim()).filter(Boolean).slice(0, 3).join(", ");
}

const entrySelect = {
  id: true,
  accented: true,
  type: true,
  aspect: true,
  gender: true,
  glossFr: true,
  translationsFr: true,
  translationsEn: true,
  exampleRu: true,
  exampleFr: true,
} as const;

type EntryRow = {
  id: number;
  accented: string;
  type: string;
  aspect: string | null;
  gender: string | null;
  glossFr: string | null;
  translationsFr: string | null;
  translationsEn: string | null;
  exampleRu: string | null;
  exampleFr: string | null;
};

function toCard(e: EntryRow, kind: Card["kind"], extra: { context?: string | null; status?: string } = {}): Card {
  return {
    entryId: e.id,
    ru: accent(e.accented),
    type: e.type,
    aspect: e.aspect,
    gender: e.gender,
    gloss: shortGloss(e),
    exampleRu: e.exampleRu,
    exampleFr: e.exampleFr,
    context: extra.context ?? null,
    kind,
    status: extra.status,
  };
}

export async function getSettings(userId: string) {
  return prisma.settings.upsert({ where: { userId }, update: {}, create: { userId } });
}

/** Cartes de révision pour ces mots (dans l'ordre donné). */
export async function cardsFor(userId: string, ids: number[]): Promise<Card[]> {
  if (ids.length === 0) return [];
  const words = await prisma.word.findMany({
    where: { userId, entryId: { in: ids } },
    include: { entry: { select: entrySelect } },
  });
  const byId = new Map(words.map((w) => [w.entryId, w]));
  return ids
    .map((id) => byId.get(id))
    .filter((w) => !!w)
    .map((w) => toCard(w.entry, "review", { context: w.context, status: w.status }));
}

/** Mots imposés d'un texte de leçon qui y figurent bien : ils entrent dans le parcours (en cours
 * d'apprentissage, avec leur phrase) quand le texte est lu. Renvoie les mots ajoutés. */
export async function learnFromText(userId: string, entryIds: number[], sentences: Map<number, string>, source: string): Promise<number> {
  const now = new Date();
  const day = parisDay(now);
  const existing = new Set(
    (await prisma.word.findMany({ where: { userId, entryId: { in: entryIds } }, select: { entryId: true } })).map((w) => w.entryId),
  );
  const fresh = entryIds.filter((id) => !existing.has(id) && sentences.has(id));
  for (const entryId of fresh) {
    const state = review(INITIAL_STATE, "good");
    await prisma.word.create({
      data: {
        userId,
        entryId,
        status: "LEARNING",
        origin: "learn",
        ...state,
        dueAt: new Date(now.getTime() + DAY_MS),
        lastReviewedAt: now,
        context: sentences.get(entryId),
        source,
      },
    });
    await prisma.reviewLog.create({ data: { userId, entryId, rating: "good", isNew: true, day } });
  }
  if (fresh.length) await bumpDay(userId, "newWords", fresh.length);
  return fresh.length;
}

async function bumpDay(userId: string, field: "newWords" | "reviews", n = 1) {
  const day = parisDay();
  await prisma.dayLog.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, [field]: n },
    update: { [field]: { increment: n } },
  });
}

/**
 * Résultat d'une carte.
 * - Nouveau mot, `known` : déclaré connu au tri → KNOWN, re-vérifié dans une semaine.
 * - Nouveau mot, `again`/`good` : entre en apprentissage (vu une première fois aujourd'hui).
 * - Révision : SM-2 ; réussi sur 2 jours → KNOWN ; raté → repasse LEARNING.
 */
export async function recordAnswer(
  userId: string,
  entryId: number,
  answer: Rating | "known",
): Promise<{ status: string; becameKnown: boolean }> {
  const now = new Date();
  const day = parisDay(now);
  const existing = await prisma.word.findUnique({ where: { userId_entryId: { userId, entryId } } });

  if (!existing) {
    const known = answer === "known";
    const state: SrsState = known
      ? { ...INITIAL_STATE, repetitions: KNOWN_AFTER_REPS, intervalDays: TRIAGE_CHECK_DAYS }
      : review(INITIAL_STATE, answer === "again" ? "again" : "good");
    await prisma.word.create({
      data: {
        userId,
        entryId,
        status: known ? "KNOWN" : "LEARNING",
        origin: known ? "triage" : "learn",
        ...state,
        // Appris aujourd'hui : revient demain (même raté — la séance l'a déjà fait répéter).
        dueAt: known ? nextDueDate(state, now) : new Date(now.getTime() + DAY_MS),
        lastReviewedAt: now,
        knownAt: known ? now : null,
      },
    });
    await prisma.reviewLog.create({ data: { userId, entryId, rating: answer, isNew: true, day } });
    await bumpDay(userId, "newWords");
    return { status: known ? "KNOWN" : "LEARNING", becameKnown: known };
  }

  const rating: Rating = answer === "known" ? "good" : answer;
  // Déjà révisé aujourd'hui (repassage dans la même séance) : on ne compte pas deux fois le jour.
  const sameDay = existing.lastReviewedAt && parisDay(existing.lastReviewedAt) === day;
  // Déjà vu aujourd'hui (repassage dans la séance, séance supplémentaire) : simple entraînement,
  // le planning fixé par la première réponse du jour ne bouge pas. On garde la trace.
  if (sameDay) {
    await prisma.reviewLog.create({ data: { userId, entryId, rating, day } });
    return { status: existing.status, becameKnown: false };
  }
  const prev: SrsState = {
    ease: existing.ease,
    intervalDays: existing.intervalDays,
    repetitions: existing.repetitions,
    lapses: existing.lapses,
  };
  const next = review(prev, rating);
  const known = rating !== "again" && next.repetitions >= KNOWN_AFTER_REPS;
  const status = known ? "KNOWN" : "LEARNING";
  await prisma.word.update({
    where: { userId_entryId: { userId, entryId } },
    data: {
      ...next,
      status,
      dueAt: rating === "again" ? new Date(now.getTime() + DAY_MS) : nextDueDate(next, now),
      lastReviewedAt: now,
      knownAt: known ? (existing.knownAt ?? now) : null,
    },
  });
  await prisma.reviewLog.create({ data: { userId, entryId, rating, day } });
  await bumpDay(userId, "reviews");
  return { status, becameKnown: known && existing.status !== "KNOWN" };
}

/** Statut déclaré à la main depuis la liste des mots (rattrapage de ce qui n'avait pas été suivi).
 * - connu : KNOWN, revérifié par une révision dans une semaine ;
 * - à apprendre : LEARNING, dû tout de suite (arrive dans les révisions du jour).
 * Ne compte pas dans le quota de nouveaux mots du jour. */
export async function setWordStatus(userId: string, entryId: number, known: boolean): Promise<string> {
  const now = new Date();
  const existing = await prisma.word.findUnique({ where: { userId_entryId: { userId, entryId } } });
  if (known) {
    if (existing?.status === "KNOWN") return "KNOWN";
    const data = {
      status: "KNOWN",
      repetitions: Math.max(existing?.repetitions ?? 0, KNOWN_AFTER_REPS),
      intervalDays: Math.max(existing?.intervalDays ?? 0, TRIAGE_CHECK_DAYS),
      dueAt: new Date(now.getTime() + TRIAGE_CHECK_DAYS * DAY_MS),
      knownAt: now,
    };
    await prisma.word.upsert({
      where: { userId_entryId: { userId, entryId } },
      update: data,
      create: { userId, entryId, origin: "manual", firstSeenAt: now, ...data },
    });
  } else {
    if (existing?.status === "LEARNING") return "LEARNING";
    const data = { status: "LEARNING", repetitions: 0, intervalDays: 0, dueAt: now, knownAt: null };
    await prisma.word.upsert({
      where: { userId_entryId: { userId, entryId } },
      update: { ...data, lapses: { increment: 1 } },
      create: { userId, entryId, origin: "manual", firstSeenAt: now, ...data },
    });
  }
  await prisma.reviewLog.create({ data: { userId, entryId, rating: known ? "manual-known" : "manual-unknown", day: parisDay(now) } });
  return known ? "KNOWN" : "LEARNING";
}

/** Mots déclarés connus au tri rapide (Mots → trier) : souvent appris avant, hors de l'app. Leur
 * date « connu le » est répartie sur les mois déjà actifs, au prorata des mots connus de chaque
 * mois (le mois le plus chargé en reçoit le plus) ; tirage déterministe par mot. */
export async function spreadKnownAt(userId: string, entryIds: number[]) {
  if (entryIds.length === 0) return;
  const known = await prisma.word.findMany({
    where: { userId, status: "KNOWN", knownAt: { not: null }, entryId: { notIn: entryIds } },
    select: { knownAt: true },
  });
  const weight = new Map<string, number>();
  for (const w of known) {
    const m = parisDay(w.knownAt!).slice(0, 7);
    weight.set(m, (weight.get(m) ?? 0) + 1);
  }
  const months = [...weight.entries()].sort(([a], [b]) => a.localeCompare(b));
  const total = months.reduce((a, [, n]) => a + n, 0);
  if (total === 0) return;
  const today = parisDay();
  for (const entryId of entryIds) {
    // Hachage du mot → position dans [0, 1) → mois selon les poids cumulés.
    const h = ((entryId * 2654435761) >>> 0) / 2 ** 32;
    let acc = 0;
    const [month] = months.find(([, n]) => (acc += n / total) > h) ?? months[months.length - 1];
    const [y, mo] = month.split("-").map(Number);
    const last = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const day = 1 + (((entryId * 40503) >>> 0) % last);
    await prisma.word.update({
      where: { userId_entryId: { userId, entryId } },
      data: { knownAt: new Date(`${month}-${String(day).padStart(2, "0")}T10:00:00.000Z`) },
    });
  }
}

/** Un mot touché dans le lecteur et « gardé » : entre dans la file avec sa phrase. */
export async function keepWord(userId: string, entryId: number, context: string, source: string) {
  const now = new Date();
  await prisma.word.upsert({
    where: { userId_entryId: { userId, entryId } },
    update: { context, source },
    create: {
      userId,
      entryId,
      status: "LEARNING",
      origin: "reader",
      dueAt: new Date(now.getTime() + DAY_MS),
      context,
      source,
    },
  });
}

// ---- Progrès ---------------------------------------------------------------------------

export interface Level {
  code: string; // 'pré-A1' | 'A1−' | 'A1' | 'A1+' | 'A2−' | … | 'C2'
  next: string | null;
  /** Ce qui manque pour le niveau suivant, en clair. */
  missing: string[];
}

// ---- Niveaux et lexiques conseillés ---------------------------------------------------
//
// Deux choses distinctes :
// - le NIVEAU se mesure sur tous les mots connus (taille du vocabulaire) ;
// - les LEXIQUES conseillés de chaque niveau (série Zlatoust du test, chacun incluant le
//   précédent) guident l'apprentissage : les leçons visent d'abord les mots qui manquent au
//   lexique du plus bas niveau incomplet, même si le niveau est déjà atteint en nombre de mots.

/** Lexiques conseillés, cumulés (A1 ⊂ A2 ⊂ B1 ⊂ B2) :
 * - "a1" : lexique A1 (ТЭУ) ;
 * - "a2" : pas de liste A2 trouvée : lexique A1 + les mots les plus fréquents du lexique B1
 *   (rang < 1 300) ;
 * - "b1" : lexique B1 (+ A1) ; "b2" : lexique B2 (+ B1, A1). Pas de lexique C1/C2. */
export type LevelList = "a1" | "a2" | "b1" | "b2";
export const LEXICONS: { list: LevelList; code: string; label: string }[] = [
  { list: "a1", code: "A1", label: "lexique A1" },
  { list: "a2", code: "A2", label: "liste A2" },
  { list: "b1", code: "B1", label: "lexique B1" },
  { list: "b2", code: "B2", label: "lexique B2" },
];
/** Rang B1 sous lequel un mot compte dans la liste A2 de repli. */
const A2_TOP_RANK = 1300;

type ListEntry = { b1Rank: number | null; inA1Minimum: boolean; inB2Minimum: boolean };

/** Le mot appartient-il au lexique ? */
export function inList(list: LevelList, e: ListEntry): boolean {
  if (list === "a1") return e.inA1Minimum;
  if (list === "a2") return e.inA1Minimum || (e.b1Rank !== null && e.b1Rank < A2_TOP_RANK);
  if (list === "b1") return e.inA1Minimum || e.b1Rank !== null;
  return e.inA1Minimum || e.b1Rank !== null || e.inB2Minimum;
}

/** Le même filtre, pour une requête sur le dictionnaire. */
export function listWhere(list: LevelList) {
  if (list === "a1") return { inA1Minimum: true };
  if (list === "a2") return { OR: [{ inA1Minimum: true }, { b1Rank: { lt: A2_TOP_RANK } }] };
  if (list === "b1") return { OR: [{ inA1Minimum: true }, { b1Rank: { not: null } }] };
  return { OR: [{ inA1Minimum: true }, { b1Rank: { not: null } }, { inB2Minimum: true }] };
}

export interface LevelDef {
  code: string;
  /** Mots connus (tous) pour atteindre le palier. */
  need: number;
  reading: number;
  /** Lexique conseillé du niveau (null : C1, C2). */
  lexicon: LevelList | null;
}

/** Part du chemin entre deux niveaux officiels qui donne le palier « − » (non officiel). */
export const LEVEL_SHARE = 0.8;

/** Seuils officiels de vocabulaire (tailles des lexiques minimums, éd. Zlatoust) : ТЭУ/A1 780,
 * ТБУ/A2 ~1 300, ТРКИ-1/B1 2 300 (ici 2 276, le lexique de l'app), ТРКИ-2/B2 ~5 100,
 * ТРКИ-3/C1 ~11 000 ; pas de lexique pour ТРКИ-4/C2 (20 000, règle « un niveau ≈ double le
 * vocabulaire » des mêmes auteurs). Non officiels, pour voir avancer : « − » à 80 % du chemin
 * depuis le niveau officiel précédent, « + » à mi-chemin du niveau officiel suivant. À l'examen, 66 % à chaque épreuve, d'où le seuil de lecture. */
const OFFICIAL_LEVELS: LevelDef[] = [
  { code: "A1", need: 780, reading: 0, lexicon: "a1" },
  { code: "A2", need: 1300, reading: 0.66, lexicon: "a2" },
  { code: "B1", need: 2276, reading: 0.66, lexicon: "b1" },
  { code: "B2", need: 5100, reading: 0.66, lexicon: "b2" },
  { code: "C1", need: 11000, reading: 0.66, lexicon: null },
  { code: "C2", need: 20000, reading: 0.66, lexicon: null },
];

export const LEVELS: LevelDef[] = (() => {
  const out: LevelDef[] = [{ code: "pré-A1", need: 0, reading: 0, lexicon: "a1" }];
  OFFICIAL_LEVELS.forEach((l, i) => {
    const prev = i ? OFFICIAL_LEVELS[i - 1] : null;
    // « − » : 80 % du chemin depuis le niveau officiel précédent (0 avant A1).
    const from = prev?.need ?? 0;
    out.push({ ...l, code: `${l.code}−`, need: Math.round(from + (l.need - from) * LEVEL_SHARE), reading: prev?.reading ?? 0 });
    out.push(l);
    // « + » : à mi-chemin du niveau officiel suivant.
    const next = OFFICIAL_LEVELS[i + 1];
    if (next) out.push({ ...l, code: `${l.code}+`, need: Math.round((l.need + next.need) / 2) });
  });
  return out;
})();

export function estimateLevel(knownAll: number, reading: number | null): Level {
  let i = 0;
  for (let j = 1; j < LEVELS.length; j++) {
    const l = LEVELS[j];
    if (knownAll >= l.need && (l.reading === 0 || (reading ?? 0) >= l.reading)) i = j;
    else break;
  }
  const next = LEVELS[i + 1];
  const missing: string[] = [];
  if (next) {
    if (knownAll < next.need) missing.push(`${next.need - knownAll} mots connus`);
    if (next.reading > 0 && (reading ?? 0) < next.reading)
      missing.push(`${Math.round(next.reading * 100)} % de réussite en lecture (actuellement ${reading === null ? "—" : Math.round(reading * 100) + " %"})`);
  }
  return { code: LEVELS[i].code, next: next?.code ?? null, missing };
}

export interface LexiconCoverage {
  list: LevelList;
  code: string;
  label: string;
  size: number;
  known: number;
  /** Mots du lexique en cours d'apprentissage. */
  learning: number;
}

/** Couverture des lexiques conseillés, et le lexique sur lequel se concentrer : le premier
 * incomplet (A1 tant qu'il manque des mots du lexique A1, puis A2…). */
export async function lexiconCoverage(userId: string): Promise<{ lexicons: LexiconCoverage[]; focus: LevelList | null }> {
  const [words, ...sizes] = await Promise.all([
    prisma.word.findMany({
      where: { userId },
      select: { status: true, entry: { select: { b1Rank: true, inA1Minimum: true, inB2Minimum: true } } },
    }),
    ...LEXICONS.map((l) => prisma.dictionaryEntry.count({ where: listWhere(l.list) })),
  ]);
  const lexicons = LEXICONS.map((l, i) => {
    const mine = words.filter((w) => inList(l.list, w.entry));
    return {
      ...l,
      size: sizes[i],
      known: mine.filter((w) => w.status === "KNOWN").length,
      learning: mine.filter((w) => w.status !== "KNOWN").length,
    };
  });
  return { lexicons, focus: lexicons.find((l) => l.known < l.size)?.list ?? null };
}

export interface LevelRung extends LevelDef {
  known: number;
  /** Mois estimé (YYYY-MM) au rythme moyen ; "atteint" ; null si rythme nul. */
  eta: string | "atteint" | null;
}

/** L'échelle des paliers (tous les mots connus) et le mois où chacun serait atteint au rythme
 * moyen (mots devenus connus par mois depuis le premier mois actif, mois en cours au prorata). */
export async function levelLadder(userId: string): Promise<LevelRung[]> {
  const words = await prisma.word.findMany({ where: { userId, status: "KNOWN" }, select: { knownAt: true } });
  const known = words.length;
  const today = parisDay();
  const [y, mo, d] = today.split("-").map(Number);
  const frac = d / new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const first = words.filter((w) => w.knownAt).map((w) => parisDay(w.knownAt!).slice(0, 7)).sort()[0];
  const elapsed = first ? (y - Number(first.slice(0, 4))) * 12 + (mo - Number(first.slice(5, 7))) + frac : 0;
  const pace = elapsed > 0 ? known / elapsed : 0;
  const addMonths = (n: number) => {
    const dt = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return LEVELS.filter((l) => l.need > 0).map((l) => {
    if (known >= l.need) return { ...l, known, eta: "atteint" as const };
    if (pace <= 0) return { ...l, known, eta: null };
    const left = (l.need - known) / pace;
    return { ...l, known, eta: addMonths(Math.max(0, Math.ceil(left - (1 - frac)))) };
  });
}

export interface Progress {
  b1Total: number;
  knownB1: number;
  learningB1: number;
  knownAll: number;
  reading30: number | null; // part de bonnes réponses, 30 jours
  readingAnswers30: number;
  level: Level;
  /** Mots connus en plus sur les 7 derniers jours, ramené par jour. */
  pacePerDay: number;
  projectedDate: string | null;
  examDate: string | null;
  daysToExam: number | null;
  /** Rythme nécessaire pour finir le lexique avant l'examen. */
  neededPerDay: number | null;
  streak: number;
}

export async function getProgress(userId: string): Promise<Progress> {
  const since30 = parisDay(new Date(Date.now() - 30 * DAY_MS));
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const [b1Total, knownB1, learningB1, knownAll, reading, newWeek, settings, days] = await Promise.all([
    prisma.dictionaryEntry.count({ where: { b1Rank: { not: null } } }),
    prisma.word.count({ where: { userId, status: "KNOWN", entry: { b1Rank: { not: null } } } }),
    prisma.word.count({ where: { userId, status: "LEARNING", entry: { b1Rank: { not: null } } } }),
    prisma.word.count({ where: { userId, status: "KNOWN" } }),
    prisma.dayLog.aggregate({
      where: { userId, day: { gte: since30 } },
      _sum: { readingRight: true, readingTotal: true },
    }),
    // Rythme = nouveaux mots du parcours abordés par jour sur la dernière semaine (un mot appris
    // ne devient « connu » qu'après sa révision du lendemain : compter les « connus » sous-estime).
    prisma.dayLog.findMany({ where: { userId, day: { gte: parisDay(weekAgo) }, newWords: { gt: 0 } }, select: { day: true, newWords: true } }),
    getSettings(userId),
    prisma.dayLog.findMany({ where: { userId }, select: { day: true }, orderBy: { day: "desc" }, take: 400 }),
  ]);
  const rt = reading._sum.readingTotal ?? 0;
  const reading30 = rt > 0 ? (reading._sum.readingRight ?? 0) / rt : null;
  // Moyenne sur les jours écoulés depuis le premier jour actif de la semaine (pas de pénalité les
  // premiers jours d'utilisation), jours sans activité compris ensuite.
  const firstActive = newWeek.map((d) => d.day).sort()[0];
  const span = firstActive
    ? Math.min(7, Math.round((Date.parse(parisDay()) - Date.parse(firstActive)) / DAY_MS) + 1)
    : 7;
  const pacePerDay = newWeek.reduce((a, d) => a + d.newWords, 0) / span;
  const remaining = b1Total - knownB1;
  const projectedDate =
    pacePerDay > 0 ? parisDay(new Date(Date.now() + Math.ceil(remaining / pacePerDay) * DAY_MS)) : null;
  const daysToExam = settings.examDate
    ? Math.ceil((Date.parse(settings.examDate + "T09:00:00") - Date.now()) / DAY_MS)
    : null;
  return {
    b1Total,
    knownB1,
    learningB1,
    knownAll,
    reading30,
    readingAnswers30: rt,
    level: estimateLevel(knownAll, reading30),
    pacePerDay,
    projectedDate,
    examDate: settings.examDate,
    daysToExam,
    neededPerDay: daysToExam && daysToExam > 0 ? Math.ceil(remaining / daysToExam) : null,
    streak: streakOf(days.map((d) => d.day)),
  };
}

/** Jours consécutifs d'activité jusqu'à aujourd'hui (ou hier, si pas encore travaillé aujourd'hui). */
export function streakOf(daysDesc: string[]): number {
  const set = new Set(daysDesc);
  let d = new Date();
  if (!set.has(parisDay(d))) d = new Date(d.getTime() - DAY_MS);
  let n = 0;
  while (set.has(parisDay(d))) {
    n++;
    d = new Date(d.getTime() - DAY_MS);
  }
  return n;
}

/** État de chaque mot du parcours B1, dans l'ordre : 0 à venir, 1 en cours, 2 connu. */
/** État de chaque mot d'un lexique conseillé, des plus fréquents aux plus rares :
 * 0 à venir, 1 en cours, 2 connu. */
export async function lexiconGrid(userId: string, list: LevelList = "b1"): Promise<{ ids: number[]; states: string }> {
  const entries = await prisma.dictionaryEntry.findMany({
    where: listWhere(list),
    orderBy: [{ b1Rank: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    select: { id: true, words: { where: { userId }, select: { status: true } } },
  });
  return {
    ids: entries.map((e) => e.id),
    states: entries.map((e) => (e.words[0] ? (e.words[0].status === "KNOWN" ? "2" : "1") : "0")).join(""),
  };
}

export interface MonthPoint {
  month: string; // "YYYY-MM"
  /** Tous les mots connus à la fin du mois (cumul), et ceux devenus connus dans le mois. */
  allTotal: number;
  allGained: number;
  /** Mots connus de chaque lexique conseillé à la fin du mois (cumul). */
  lex: Record<LevelList, number>;
}

/** Courbe cumulée des mots connus, mois par mois : du mois précédant le premier mot connu
 * (point de départ à 0) jusqu'au mois en cours. Chaque mot compte au mois où il est devenu connu
 * (en leçon : après deux jours de révisions réussies). */
export async function knownByMonth(userId: string): Promise<MonthPoint[]> {
  const words = await prisma.word.findMany({
    where: { userId, status: "KNOWN", knownAt: { not: null } },
    select: { knownAt: true, entry: { select: { b1Rank: true, inA1Minimum: true, inB2Minimum: true } } },
  });
  const empty = (): Record<LevelList, number> => ({ a1: 0, a2: 0, b1: 0, b2: 0 });
  const allGained = new Map<string, number>();
  const lexGained = new Map<string, Record<LevelList, number>>();
  for (const w of words) {
    const m = parisDay(w.knownAt!).slice(0, 7);
    allGained.set(m, (allGained.get(m) ?? 0) + 1);
    const g = lexGained.get(m) ?? empty();
    for (const l of LEXICONS) if (inList(l.list, w.entry)) g[l.list]++;
    lexGained.set(m, g);
  }
  const current = parisDay().slice(0, 7);
  const first = [...allGained.keys()].sort()[0] ?? current;
  const shift = (m: string, n: number) => {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const points: MonthPoint[] = [];
  let allTotal = 0;
  const lex = empty();
  for (let m = shift(first, -1); m <= current; m = shift(m, 1)) {
    const ag = allGained.get(m) ?? 0;
    allTotal += ag;
    const g = lexGained.get(m);
    if (g) for (const l of LEXICONS) lex[l.list] += g[l.list];
    points.push({ month: m, allTotal, allGained: ag, lex: { ...lex } });
  }
  return points;
}

/** Activité des N derniers jours (calendrier). */
export async function activity(userId: string, days = 70) {
  const since = parisDay(new Date(Date.now() - days * DAY_MS));
  const rows = await prisma.dayLog.findMany({ where: { userId, day: { gte: since } } });
  return rows.map((r) => ({ day: r.day, total: r.newWords + r.reviews + r.textsRead * 10 }));
}

/** Où en est la journée : sert aux rappels (ne pas déranger si c'est fait). */
export async function todayStatus(userId: string) {
  const day = parisDay();
  const { lessonsToday } = await import("@/lib/lessons");
  const [lessons, log, days] = await Promise.all([
    lessonsToday(userId),
    prisma.dayLog.findUnique({ where: { userId_day: { userId, day } } }),
    prisma.dayLog.findMany({ where: { userId }, select: { day: true }, orderBy: { day: "desc" }, take: 400 }),
  ]);
  return {
    lessons,
    activeToday: !!log && log.newWords + log.reviews + log.textsRead > 0,
    streak: streakOf(days.map((d) => d.day)),
  };
}
