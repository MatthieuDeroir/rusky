import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { cardsFor, inList, LEXICONS, lexiconCoverage, listWhere, type Card } from "@/lib/learn";
import { BASE_NEW_PER_LESSON, currentPlan, REVIEWS_PER_LESSON } from "@/lib/memory";

/** Trois leçons par jour. Chacune : révisions → un texte à 95 % de mots connus, dont les autres
 * sont les mots nouveaux du lexique en cours. */
export const SLOTS = [
  { id: "matin", label: "Matin", of: "du matin", from: 0 },
  { id: "apres-midi", label: "Après-midi", of: "de l’après-midi", from: 12 },
  { id: "soir", label: "Soir", of: "du soir", from: 18 },
] as const;
export type SlotId = (typeof SLOTS)[number]["id"];

/** Mots nouveaux par leçon : la valeur de base (le plan réel dépend de la mémoire, voir memory.ts). */
export const NEW_PER_LESSON = BASE_NEW_PER_LESSON;
/** Révisions par leçon. */
export const REVIEW_TOTAL = REVIEWS_PER_LESSON;
export function isSlot(s: string | undefined | null): s is SlotId {
  return SLOTS.some((x) => x.id === s);
}

/** « du matin », « de l’après-midi », « du soir ». */
export function slotOf(s: SlotId): string {
  return SLOTS.find((x) => x.id === s)!.of;
}

export function parisHour(d = new Date()): number {
  // formatToParts : en fr-FR, format() renvoie « 08 h », pas un nombre.
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")!.value);
}

/** Créneau de l'heure actuelle (matin avant midi, après-midi jusqu'à 18 h, soir ensuite). */
export function slotAt(d = new Date()): SlotId {
  const h = parisHour(d);
  return [...SLOTS].reverse().find((s) => h >= s.from)!.id;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Les révisions d'une leçon (40), réparties entre mots appris et mots en cours selon le taux
 * d'oubli (memory.ts : plus j'oublie, plus les mots appris reviennent).
 * - En cours (dont les mots oubliés) : d'abord ceux dont l'échéance est arrivée (ratés la veille),
 *   puis les plus souvent oubliés, puis les moins récemment revus.
 * - Appris : d'abord ceux du lexique en cours (le plus bas niveau incomplet), les moins récemment
 *   revus en premier, au hasard à égalité.
 * Si une catégorie manque de mots, l'autre complète.
 */
export async function pickReviews(userId: string): Promise<number[]> {
  const [words, { focus }, plan] = await Promise.all([
    prisma.word.findMany({
      // Mots des lexiques conseillés (A1, B1, B2 — les leçons enseignent le lexique en cours).
      where: { userId, entry: listWhere("b2") },
      select: {
        entryId: true,
        status: true,
        dueAt: true,
        lastReviewedAt: true,
        forgetCount: true,
        entry: { select: { b1Rank: true, inA1Minimum: true, inB2Minimum: true } },
      },
    }),
    lexiconCoverage(userId),
    currentPlan(userId),
  ]);
  const today = parisDay();
  const seen = (w: (typeof words)[number]) => w.lastReviewedAt?.getTime() ?? 0;
  const learning = shuffle(words.filter((w) => w.status !== "KNOWN")).sort(
    (a, b) =>
      Number(parisDay(b.dueAt) <= today) - Number(parisDay(a.dueAt) <= today) ||
      b.forgetCount - a.forgetCount ||
      seen(a) - seen(b),
  );
  const inFocus = (w: (typeof words)[number]) => (focus ? inList(focus, w.entry) : false);
  const learned = shuffle(words.filter((w) => w.status === "KNOWN")).sort(
    (a, b) => Number(inFocus(b)) - Number(inFocus(a)) || seen(a) - seen(b),
  );
  const nLearning = Math.min(learning.length, plan.reviewLearning + Math.max(0, plan.reviewLearned - learned.length));
  const nLearned = Math.min(learned.length, REVIEW_TOTAL - nLearning);
  return shuffle([...learning.slice(0, nLearning), ...learned.slice(0, nLearned)].map((w) => w.entryId));
}

/** Ouvre (ou reprend) une leçon : la liste des révisions est figée à la première ouverture. */
export async function openLesson(userId: string, slot: SlotId) {
  const day = parisDay();
  const key = { userId_day_slot: { userId, day, slot } };
  const existing = await prisma.lesson.findUnique({ where: key });
  if (existing) return existing;
  const reviewIds = await pickReviews(userId);
  // upsert : deux ouvertures simultanées ne créent qu'une leçon.
  return prisma.lesson.upsert({ where: key, update: {}, create: { userId, day, slot, reviewIds: JSON.stringify(reviewIds) } });
}

/** Ce qui reste à réviser dans la leçon (reprise après un rechargement). */
export async function remainingReviews(userId: string, lesson: { reviewIds: string; createdAt: Date; reviewsDoneAt: Date | null }): Promise<Card[]> {
  if (lesson.reviewsDoneAt) return [];
  const ids = JSON.parse(lesson.reviewIds) as number[];
  const done = await prisma.reviewLog.findMany({
    where: { userId, entryId: { in: ids }, at: { gte: lesson.createdAt } },
    select: { entryId: true },
  });
  const seen = new Set(done.map((d) => d.entryId));
  return cardsFor(userId, ids.filter((id) => !seen.has(id)));
}

/** Les prochains mots pour le texte d'une leçon : jamais rencontrés, pas déjà réservés par le
 * texte d'une autre leçon du jour encore non lu, et pris dans le lexique conseillé du plus bas
 * niveau incomplet (A1, puis A2, B1, B2), les plus fréquents d'abord : on comble le lexique A1
 * même si le niveau A1 est déjà atteint en nombre de mots. Combien : selon la mémoire (taux
 * d'oubli, voir memory.ts). */
export async function reserveNewWords(userId: string): Promise<number[]> {
  const pending = await prisma.text.findMany({
    where: {
      userId,
      forDay: parisDay(),
      newEntryIds: { not: null },
      progress: { none: { userId, completedAt: { not: null } } },
      status: { not: "FAILED" },
    },
    select: { newEntryIds: true },
  });
  const reserved = pending.flatMap((t) => JSON.parse(t.newEntryIds!) as number[]);
  const { newPerLesson } = await currentPlan(userId);
  const picked: number[] = [];
  for (const l of LEXICONS) {
    if (picked.length >= newPerLesson) break;
    const entries = await prisma.dictionaryEntry.findMany({
      where: { AND: [listWhere(l.list), { words: { none: { userId } } }, { id: { notIn: [...reserved, ...picked] } }] },
      // Rang B1 = fréquence ; les mots hors lexique B1 (A1 ou B2 seuls) ensuite.
      orderBy: [{ b1Rank: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: newPerLesson - picked.length,
      select: { id: true },
    });
    picked.push(...entries.map((e) => e.id));
  }
  return picked;
}

export interface LessonStatus {
  slot: SlotId;
  label: string;
  /** « du matin », « de l’après-midi »… */
  of: string;
  started: boolean;
  reviewsDone: boolean;
  newRead: boolean;
  done: boolean;
}

/** État des trois leçons du jour (accueil, rappels). */
export async function lessonsToday(userId: string): Promise<LessonStatus[]> {
  const day = parisDay();
  const rows = await prisma.lesson.findMany({ where: { userId, day } });
  const textIds = rows.flatMap((r) => [r.knownTextId, r.newTextId]).filter((x): x is number => x !== null);
  const read = new Set(
    (
      await prisma.textProgress.findMany({
        where: { userId, textId: { in: textIds }, completedAt: { not: null } },
        select: { textId: true },
      })
    ).map((p) => p.textId),
  );
  return SLOTS.map((s) => {
    const r = rows.find((x) => x.slot === s.id);
    return {
      slot: s.id,
      label: s.label,
      of: s.of,
      started: !!r,
      reviewsDone: !!r?.reviewsDoneAt,
      newRead: !!r?.newTextId && read.has(r.newTextId),
      // Une leçon est faite quand son texte est lu (l'ancien texte « connu » n'existe plus).
      done: !!r?.completedAt || (!!r?.newTextId && read.has(r.newTextId)),
    };
  });
}

/** Leçon conseillée : celle du créneau actuel si elle n'est pas faite, sinon la première restante. */
export function suggestedSlot(lessons: LessonStatus[], now = new Date()): SlotId | null {
  const cur = slotAt(now);
  if (!lessons.find((l) => l.slot === cur)!.done) return cur;
  return lessons.find((l) => !l.done)?.slot ?? null;
}
