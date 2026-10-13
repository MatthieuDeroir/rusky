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
  code: string; // 'pré-A1' | 'A1' | 'A1+' | 'A2' | … | 'C2'
  next: string | null;
  /** Ce qui manque pour le niveau suivant, en clair. */
  missing: string[];
}

/** Liste de mots sur laquelle un palier se mesure (une seule série de sources : les lexiques
 * minimums Zlatoust du test, chacun incluant le précédent) :
 * - "top" : les `size` mots les plus fréquents du lexique B1 (pas de liste A1/A2 publique : on
 *   prend le niveau suivant, B1, restreint à ses mots les plus fréquents) ;
 * - "b1" : le lexique B1 ; "b2" : lexique B2 ∪ lexique B1 ;
 * - "all" : tous les mots connus (pas de liste publique pour C1, et aucune pour C2). */
export type LevelList = "top" | "b1" | "b2" | "all";

export interface LevelDef {
  code: string;
  list: LevelList;
  /** Taille de la liste (pour "top" : le nombre de mots les plus fréquents retenus). */
  size: number;
  /** Mots de la liste à connaître pour atteindre le palier. */
  need: number;
  reading: number;
}

/** Part d'une liste à connaître pour atteindre un palier. */
export const LEVEL_SHARE = 0.8;

/** Paliers. Tailles officielles des lexiques minimums (éd. Zlatoust) : ТЭУ/A1 780 unités,
 * ТБУ/A2 ~1 300, ТРКИ-1/B1 2 300 (ici 2 276), ТРКИ-2/B2 ~5 100 (ici 5 348 avec le B1),
 * ТРКИ-3/C1 « свыше 11 000 » ; pas de lexique pour ТРКИ-4/C2 (20 000, règle « un niveau ≈ double
 * le vocabulaire » des mêmes auteurs). Palier atteint à 80 % de sa liste ; les niveaux « + » sont
 * à mi-chemin, pour voir avancer. À l'examen, 66 % à chaque épreuve, d'où le seuil de lecture. */
export function levelDefs(b1Size: number, b2Size: number): LevelDef[] {
  const top = (code: string, size: number, reading = 0): LevelDef => ({
    code,
    list: "top",
    size,
    need: Math.ceil(size * LEVEL_SHARE),
    reading,
  });
  const b1Need = Math.ceil(b1Size * LEVEL_SHARE);
  const b2Need = Math.ceil(b2Size * LEVEL_SHARE);
  return [
    { code: "pré-A1", list: "top", size: 0, need: 0, reading: 0 },
    top("A1", 780),
    top("A1+", 1040),
    top("A2", 1300, 0.66),
    top("A2+", 1788, 0.66),
    { code: "B1", list: "b1", size: b1Size, need: b1Need, reading: 0.66 },
    // B1+ : à mi-chemin entre B1 et B2, mesuré sur la liste B2.
    { code: "B1+", list: "b2", size: b2Size, need: Math.round((b1Need + b2Need) / 2), reading: 0.66 },
    { code: "B2", list: "b2", size: b2Size, need: b2Need, reading: 0.66 },
    { code: "B2+", list: "all", size: 8000, need: 8000, reading: 0.66 },
    { code: "C1", list: "all", size: 11000, need: 11000, reading: 0.66 },
    { code: "C1+", list: "all", size: 15500, need: 15500, reading: 0.66 },
    { code: "C2", list: "all", size: 20000, need: 20000, reading: 0.66 },
  ];
}

/** Mots connus d'une liste. */
export interface KnownWordLists {
  b1Ranks: number[]; // b1Rank des mots connus du lexique B1
  b2: number; // mots connus du lexique B2 ∪ B1
  all: number;
}

export function knownIn(l: LevelDef, k: KnownWordLists): number {
  if (l.list === "top") return k.b1Ranks.filter((r) => r < l.size).length;
  if (l.list === "b1") return k.b1Ranks.length;
  if (l.list === "b2") return k.b2;
  return k.all;
}

export function estimateLevel(defs: LevelDef[], k: KnownWordLists, reading: number | null): Level {
  let i = 0;
  for (let j = 1; j < defs.length; j++) {
    const l = defs[j];
    if (knownIn(l, k) >= l.need && (l.reading === 0 || (reading ?? 0) >= l.reading)) i = j;
    else break;
  }
  const next = defs[i + 1];
  const missing: string[] = [];
  if (next) {
    const n = next.need - knownIn(next, k);
    const where =
      next.list === "top"
        ? `des ${next.size} mots les plus fréquents du lexique B1`
        : next.list === "b1"
          ? "du lexique B1"
          : next.list === "b2"
            ? "du lexique B2"
            : "en tout";
    if (n > 0) missing.push(`${n} mots ${where}`);
    if (next.reading > 0 && (reading ?? 0) < next.reading)
      missing.push(`${Math.round(next.reading * 100)} % de réussite en lecture (actuellement ${reading === null ? "—" : Math.round(reading * 100) + " %"})`);
  }
  return { code: defs[i].code, next: next?.code ?? null, missing };
}

/** Mots connus par liste, et la date où chacun l'est devenu (rythmes, historique). */
export async function knownWordLists(userId: string) {
  const [words, b1Size, b2Size] = await Promise.all([
    prisma.word.findMany({
      where: { userId, status: "KNOWN" },
      select: { knownAt: true, entry: { select: { b1Rank: true, inB2Minimum: true } } },
    }),
    prisma.dictionaryEntry.count({ where: { b1Rank: { not: null } } }),
    prisma.dictionaryEntry.count({ where: { OR: [{ b1Rank: { not: null } }, { inB2Minimum: true }] } }),
  ]);
  const lists: KnownWordLists = {
    b1Ranks: words.filter((w) => w.entry.b1Rank !== null).map((w) => w.entry.b1Rank!),
    b2: words.filter((w) => w.entry.b1Rank !== null || w.entry.inB2Minimum).length,
    all: words.length,
  };
  return { words, lists, defs: levelDefs(b1Size, b2Size) };
}

export interface LevelRung extends LevelDef {
  known: number;
  /** Mois estimé (YYYY-MM) au rythme moyen de cette liste ; "atteint" ; null si rythme nul. */
  eta: string | "atteint" | null;
}

/** L'échelle des paliers : où j'en suis sur chaque liste, et quand je l'atteindrais au rythme
 * moyen observé sur cette liste (mots devenus connus par mois depuis le premier mois actif). */
export async function levelLadder(userId: string): Promise<LevelRung[]> {
  const { words, lists, defs } = await knownWordLists(userId);
  const today = parisDay();
  const [y, mo, d] = today.split("-").map(Number);
  const frac = d / new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const months = words.filter((w) => w.knownAt).map((w) => parisDay(w.knownAt!).slice(0, 7)).sort();
  const first = months[0];
  const elapsed = first
    ? (y - Number(first.slice(0, 4))) * 12 + (mo - Number(first.slice(5, 7))) + frac
    : 0;
  const addMonths = (n: number) => {
    const dt = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return defs
    .filter((l) => l.need > 0)
    .map((l) => {
      const known = knownIn(l, lists);
      if (known >= l.need) return { ...l, known, eta: "atteint" as const };
      const pace = elapsed > 0 ? known / elapsed : 0;
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
  const [b1Total, knownB1, learningB1, knownAll, reading, newWeek, settings, days, lists] = await Promise.all([
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
    knownWordLists(userId),
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
    level: estimateLevel(lists.defs, lists.lists, reading30),
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
export async function lexiconGrid(userId: string): Promise<{ ids: number[]; states: string }> {
  const [entries, words] = await Promise.all([
    prisma.dictionaryEntry.findMany({
      where: { b1Rank: { not: null } },
      orderBy: { b1Rank: "asc" },
      select: { id: true },
    }),
    prisma.word.findMany({
      where: { userId, entry: { b1Rank: { not: null } } },
      select: { entryId: true, status: true },
    }),
  ]);
  const st = new Map(words.map((w) => [w.entryId, w.status === "KNOWN" ? "2" : "1"]));
  return { ids: entries.map((e) => e.id), states: entries.map((e) => st.get(e.id) ?? "0").join("") };
}

export interface MonthPoint {
  month: string; // "YYYY-MM"
  /** Mots du lexique B1 connus à la fin du mois (cumul). */
  total: number;
  /** Devenus connus pendant le mois. */
  gained: number;
  /** Idem, tous les mots (lexique B1 et hors lexique). */
  allTotal: number;
  allGained: number;
  /** Mots connus de la liste du prochain palier (cumul), si un palier est suivi. */
  levelTotal: number;
}

/** Le mot appartient-il à la liste du palier ? */
function inLevelList(l: LevelDef, e: { b1Rank: number | null; inB2Minimum: boolean }): boolean {
  if (l.list === "top") return e.b1Rank !== null && e.b1Rank < l.size;
  if (l.list === "b1") return e.b1Rank !== null;
  if (l.list === "b2") return e.b1Rank !== null || e.inB2Minimum;
  return true;
}

/** Courbe cumulée des mots du lexique B1 connus, mois par mois : du mois précédant le premier mot
 * connu (point de départ à 0) jusqu'au mois en cours. Chaque mot compte au mois où il est devenu
 * connu (en leçon : après deux jours de révisions réussies). */
export async function knownByMonth(userId: string, level: LevelDef | null = null): Promise<MonthPoint[]> {
  const words = await prisma.word.findMany({
    where: { userId, status: "KNOWN", knownAt: { not: null } },
    select: { knownAt: true, entry: { select: { b1Rank: true, inB2Minimum: true } } },
  });
  const gained = new Map<string, number>();
  const allGained = new Map<string, number>();
  const levelGained = new Map<string, number>();
  for (const w of words) {
    const m = parisDay(w.knownAt!).slice(0, 7);
    allGained.set(m, (allGained.get(m) ?? 0) + 1);
    if (w.entry.b1Rank !== null) gained.set(m, (gained.get(m) ?? 0) + 1);
    if (level && inLevelList(level, w.entry)) levelGained.set(m, (levelGained.get(m) ?? 0) + 1);
  }
  const current = parisDay().slice(0, 7);
  const first = [...allGained.keys()].sort()[0] ?? current;
  const shift = (m: string, n: number) => {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const points: MonthPoint[] = [];
  let total = 0;
  let allTotal = 0;
  let levelTotal = 0;
  for (let m = shift(first, -1); m <= current; m = shift(m, 1)) {
    const g = gained.get(m) ?? 0;
    const ag = allGained.get(m) ?? 0;
    total += g;
    allTotal += ag;
    levelTotal += levelGained.get(m) ?? 0;
    points.push({ month: m, total, gained: g, allTotal, allGained: ag, levelTotal });
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
