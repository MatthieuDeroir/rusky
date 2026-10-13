import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { cardsFor, type Card } from "@/lib/learn";

/** Trois leçons par jour. Chacune : révisions → texte avec les mots connus → texte avec
 * 10 mots nouveaux. */
export const SLOTS = [
  { id: "matin", label: "Matin", of: "du matin", from: 0 },
  { id: "apres-midi", label: "Après-midi", of: "de l’après-midi", from: 12 },
  { id: "soir", label: "Soir", of: "du soir", from: 18 },
] as const;
export type SlotId = (typeof SLOTS)[number]["id"];

/** Révisions d'une leçon : 50 mots parmi ceux appris cette semaine + 20 au hasard parmi tous. */
export const REVIEW_TOTAL = 70;
const RECENT_COUNT = 50;
const RECENT_DAYS = 7;
/** Mots nouveaux imposés au second texte de chaque leçon. */
export const NEW_PER_LESSON = 10;
const DAY_MS = 86_400_000;

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
 * Les 70 mots à réviser (lexique B1, connus ou en cours).
 * - 50 parmi les mots entrés dans le parcours depuis 7 jours, les moins récemment revus d'abord
 *   (d'une leçon à l'autre, ce ne sont pas toujours les mêmes) ; les mots simplement déclarés
 *   connus depuis la liste n'en font pas partie : ils n'ont pas été appris cette semaine.
 * - 20 au hasard parmi tous les autres.
 * S'il y a moins de 50 mots récents, le hasard complète jusqu'à 70.
 */
export async function pickReviews(userId: string): Promise<number[]> {
  const words = await prisma.word.findMany({
    where: { userId, entry: { b1Rank: { not: null } } },
    select: { entryId: true, firstSeenAt: true, lastReviewedAt: true, origin: true, status: true },
  });
  const since = Date.now() - RECENT_DAYS * DAY_MS;
  const isRecent = (w: (typeof words)[number]) =>
    w.firstSeenAt.getTime() >= since && !(w.origin === "manual" && w.status === "KNOWN");
  const recent = shuffle(words.filter(isRecent))
    .sort((a, b) => (a.lastReviewedAt?.getTime() ?? 0) - (b.lastReviewedAt?.getTime() ?? 0))
    .slice(0, RECENT_COUNT);
  const taken = new Set(recent.map((w) => w.entryId));
  const others = shuffle(words.filter((w) => !taken.has(w.entryId))).slice(0, REVIEW_TOTAL - recent.length);
  return shuffle([...recent, ...others].map((w) => w.entryId));
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

/** Les prochains mots du parcours pour le texte d'une leçon : jamais rencontrés, et pas déjà
 * réservés par le texte d'une autre leçon du jour encore non lu. */
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
  const entries = await prisma.dictionaryEntry.findMany({
    where: { b1Rank: { not: null }, words: { none: { userId } }, id: { notIn: reserved } },
    orderBy: { b1Rank: "asc" },
    take: NEW_PER_LESSON,
    select: { id: true },
  });
  return entries.map((e) => e.id);
}

export interface LessonStatus {
  slot: SlotId;
  label: string;
  /** « du matin », « de l’après-midi »… */
  of: string;
  started: boolean;
  reviewsDone: boolean;
  knownRead: boolean;
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
      knownRead: !!r?.knownTextId && read.has(r.knownTextId),
      newRead: !!r?.newTextId && read.has(r.newTextId),
      done: !!r?.completedAt,
    };
  });
}

/** Leçon conseillée : celle du créneau actuel si elle n'est pas faite, sinon la première restante. */
export function suggestedSlot(lessons: LessonStatus[], now = new Date()): SlotId | null {
  const cur = slotAt(now);
  if (!lessons.find((l) => l.slot === cur)!.done) return cur;
  return lessons.find((l) => !l.done)?.slot ?? null;
}
