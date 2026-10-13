"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { addXp, type XpAward } from "@/lib/xp";
import { parisDay } from "@/lib/dates";
import { runAnalysis } from "@/lib/reader/analyze";
import { findUnit, UNITS } from "@/lib/reader/curriculum";
import { createGeneratedPlaceholder, fillGeneratedText, type GeneratedPurpose } from "@/lib/reader/generate";
import { getUnitStates, questionScore } from "@/lib/reader/progress";
import { dueReviews, rateReview, type ReviewCard } from "@/lib/reader/review";
import type { ReaderAnalysis, ReadingStatus } from "@/lib/reader/types";
import type { Rating } from "@/lib/srs";

const UNIT_TEXTS = 2;

export interface TextRef {
  id: number;
  title: string;
  status: ReadingStatus;
  completed: boolean;
}

async function refs(userId: string, ids: number[]): Promise<TextRef[]> {
  if (ids.length === 0) return [];
  const [texts, progress] = await Promise.all([
    prisma.readingText.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, status: true } }),
    prisma.readingProgress.findMany({ where: { userId, textId: { in: ids } }, select: { textId: true, completedAt: true } }),
  ]);
  const done = new Set(progress.filter((p) => p.completedAt).map((p) => p.textId));
  return ids
    .map((id) => texts.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.id, title: t.title, status: t.status as ReadingStatus, completed: done.has(t.id) }));
}

/** Lance la génération en tâche de fond d'un texte (ligne créée tout de suite). */
async function spawn(
  userId: string,
  purpose: GeneratedPurpose,
  unitId: string | null,
  level: number,
  forDay: string | null,
): Promise<number> {
  const id = await createGeneratedPlaceholder(userId, { purpose, unitId, level, forDay });
  after(() => fillGeneratedText(id, { purpose, unitId, level }));
  return id;
}

// ---- Quotidien ----------------------------------------------------------------------

export interface TodayState {
  day: string;
  daily: TextRef | null;
  decode: { id: number; status: ReadingStatus; analysis: ReaderAnalysis | null } | null;
  /** Unité mise en avant dans les textes de la semaine. */
  unitTitle: string | null;
}

/** Texte du jour + phrase à décortiquer : créés à la première visite de la journée, générés en
 * tâche de fond pendant la révision éclair. Idempotent. */
export async function ensureTodayAction(): Promise<TodayState> {
  const userId = await currentUserId();
  const day = parisDay();
  const { units, level } = await getUnitStates(userId);
  // La structure du dernier week-end : l'unité commencée la plus avancée, sinon la dernière validée.
  const started = units.filter((u) => u.status !== "todo");
  const focus = started.length ? started[started.length - 1].unit : null;

  const existing = await prisma.readingText.findMany({
    where: { userId, forDay: day, purpose: { in: ["daily", "decode"] } },
    orderBy: { id: "asc" },
  });
  let daily = existing.find((t) => t.purpose === "daily");
  let decode = existing.find((t) => t.purpose === "decode");
  if (!daily) {
    const id = await spawn(userId, "daily", focus?.id ?? null, level, day);
    daily = (await prisma.readingText.findUnique({ where: { id } }))!;
  }
  if (!decode) {
    const id = await spawn(userId, "decode", focus?.id ?? null, level, day);
    decode = (await prisma.readingText.findUnique({ where: { id } }))!;
  }
  const [dailyRef] = await refs(userId, [daily.id]);
  return {
    day,
    daily: dailyRef ?? null,
    decode: {
      id: decode.id,
      status: decode.status as ReadingStatus,
      analysis: decode.analysis ? (JSON.parse(decode.analysis) as ReaderAnalysis) : null,
    },
    unitTitle: focus?.title ?? null,
  };
}

/** Fin de la phrase à décortiquer : XP de structure si tout a été trouvé du premier coup. */
export async function finishDecodeAction(textId: number, allRight: boolean): Promise<{ xp?: XpAward }> {
  const userId = await currentUserId();
  const text = await prisma.readingText.findUnique({ where: { id: textId } });
  if (!text || text.userId !== userId) throw new Error("Phrase introuvable");
  const prev = await prisma.readingProgress.findUnique({ where: { userId_textId: { userId, textId } } });
  if (prev?.completedAt) return {};
  await prisma.readingProgress.upsert({
    where: { userId_textId: { userId, textId } },
    create: { userId, textId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
  return { xp: await addXp(userId, allRight ? "sentence" : "structure") };
}

// ---- Révision éclair ----------------------------------------------------------------

export async function getDueReviewsAction(limit = 8): Promise<ReviewCard[]> {
  const userId = await currentUserId();
  return dueReviews(userId, Math.min(Math.max(limit, 1), 20));
}

export async function rateReviewAction(key: string, rating: Rating): Promise<{ xp?: XpAward }> {
  const userId = await currentUserId();
  await rateReview(userId, key, rating);
  return { xp: rating === "again" ? undefined : await addXp(userId, "review") };
}

// ---- Séance du week-end -------------------------------------------------------------

export interface UnitSession {
  unitId: string;
  lesson: TextRef | null;
  texts: TextRef[];
  score: { right: number; total: number; answered: number };
  completed: boolean;
}

/** Ouvre (ou reprend) une unité : phrases-clés partagées + 2 lectures guidées personnelles,
 * générées en tâche de fond si besoin. Idempotent. */
export async function ensureUnitAction(unitId: string): Promise<UnitSession> {
  const userId = await currentUserId();
  const unit = findUnit(unitId);
  if (!unit) throw new Error("Unité inconnue");
  const { level } = await getUnitStates(userId);
  const effectiveLevel = Math.max(level, unit.n);

  const progress = await prisma.unitProgress.upsert({
    where: { userId_unitId: { userId, unitId } },
    create: { userId, unitId },
    update: {},
  });

  // Phrases-clés : un texte partagé (userId null), analysé une seule fois pour tout le monde.
  let lesson = await prisma.readingText.findFirst({ where: { source: "lesson", unitId, userId: null } });
  if (!lesson) {
    lesson = await prisma.readingText.create({
      data: {
        userId: null,
        source: "lesson",
        purpose: "lesson",
        unitId,
        title: `Phrases-clés — ${unit.title}`,
        body: unit.keySentences.join("\n"),
      },
    });
    const id = lesson.id;
    after(() => runAnalysis(id));
  }

  const texts = await prisma.readingText.findMany({
    where: { userId, purpose: "unit", unitId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const ids = texts.map((t) => t.id);
  for (let i = ids.length; i < UNIT_TEXTS; i++) ids.push(await spawn(userId, "unit", unitId, effectiveLevel, null));

  const [lessonRef] = await refs(userId, [lesson.id]);
  return {
    unitId,
    lesson: lessonRef ?? null,
    texts: await refs(userId, ids),
    score: await questionScore(userId, [lesson.id, ...ids]),
    completed: !!progress.completedAt,
  };
}

/** Un texte guidé de plus pour l'unité (quand les deux premiers sont lus). */
export async function moreUnitTextAction(unitId: string): Promise<{ id: number }> {
  const userId = await currentUserId();
  const unit = findUnit(unitId);
  if (!unit) throw new Error("Unité inconnue");
  const { level } = await getUnitStates(userId);
  const id = await spawn(userId, "unit", unitId, Math.max(level, unit.n), null);
  revalidatePath(`/seance/${unitId}`);
  return { id };
}

/** Valide l'unité (bilan) : enregistre le score, débloque la suivante. */
export async function completeUnitAction(unitId: string): Promise<{ xp?: XpAward; next: string | null }> {
  const userId = await currentUserId();
  const unit = findUnit(unitId);
  if (!unit) throw new Error("Unité inconnue");
  const texts = await prisma.readingText.findMany({
    where: { OR: [{ userId, purpose: "unit", unitId }, { source: "lesson", unitId, userId: null }] },
    select: { id: true },
  });
  const { right, answered } = await questionScore(userId, texts.map((t) => t.id));
  const prev = await prisma.unitProgress.findUnique({ where: { userId_unitId: { userId, unitId } } });
  await prisma.unitProgress.upsert({
    where: { userId_unitId: { userId, unitId } },
    create: { userId, unitId, completedAt: new Date(), score: answered ? right / answered : null },
    update: { completedAt: prev?.completedAt ?? new Date(), score: answered ? right / answered : null },
  });
  const xp = prev?.completedAt ? undefined : await addXp(userId, "unit");
  revalidatePath("/seance");
  revalidatePath("/");
  const next = UNITS.find((u) => u.n === unit.n + 1);
  return { xp, next: next?.id ?? null };
}
