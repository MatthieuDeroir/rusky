import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { accent, shortGloss } from "@/lib/learn";

// Mémorisation : ce que je retiens, ce que j'oublie, et le rythme qui en découle.
//
// - Un mot APPRIS l'est pour de bon (learnedAt) : l'oublier ne le retire pas des mots appris,
//   c'est une autre statistique (oublis, réapprentissages).
// - Le TAUX D'OUBLI récent (part des révisions de mots appris ratées) règle les leçons :
//   plus j'oublie, plus les révisions portent sur les mots déjà appris et moins il y a de mots
//   nouveaux ; moins j'oublie, plus on avance.

const DAY_MS = 86_400_000;
/** Fenêtre de mesure des taux. */
const WINDOW_DAYS = 14;
/** Révisions par leçon. */
export const REVIEWS_PER_LESSON = 40;
/** Mots nouveaux par leçon, avant ajustement. */
export const BASE_NEW_PER_LESSON = 10;
/** Taux d'oubli « normal » : au-dessus on ralentit, en dessous on accélère. */
const TARGET_FORGET = 0.1;
/** Révisions de mots appris nécessaires avant d'ajuster (sinon, valeurs de base). */
const MIN_SAMPLE = 20;
/** Au-delà de ce nombre de mots en cours, on n'en ajoute presque plus. */
const BACKLOG_LIMIT = 200;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface MemoryStats {
  /** Mots appris (au moins une fois). */
  learned: number;
  /** En cours d'apprentissage (jamais encore appris). */
  learning: number;
  /** Appris puis oubliés, à réapprendre en ce moment. */
  forgottenNow: number;
  /** Mots oubliés au moins une fois, et réappris au moins une fois. */
  everForgotten: number;
  relearned: number;
  /** Oublis au total (un mot peut être oublié plusieurs fois). */
  forgetEvents: number;
  /** Sur 14 jours : part des révisions de mots appris ratées, et des mots en cours réussis. */
  forgetRate: number | null;
  learningSuccess: number | null;
  sample: number;
}

export async function memoryStats(userId: string): Promise<MemoryStats> {
  const since = parisDay(new Date(Date.now() - WINDOW_DAYS * DAY_MS));
  const [words, logs] = await Promise.all([
    prisma.word.findMany({
      where: { userId },
      select: { status: true, learnedAt: true, forgetCount: true, relearnCount: true },
    }),
    prisma.reviewLog.findMany({
      where: { userId, day: { gte: since }, prevStatus: { not: null }, rating: { in: ["again", "good", "easy"] } },
      select: { rating: true, prevStatus: true },
    }),
  ]);
  const ofKnown = logs.filter((l) => l.prevStatus === "KNOWN");
  const ofLearning = logs.filter((l) => l.prevStatus === "LEARNING");
  return {
    learned: words.filter((w) => w.learnedAt).length,
    learning: words.filter((w) => !w.learnedAt).length,
    forgottenNow: words.filter((w) => w.learnedAt && w.status !== "KNOWN").length,
    everForgotten: words.filter((w) => w.forgetCount > 0).length,
    relearned: words.filter((w) => w.relearnCount > 0).length,
    forgetEvents: words.reduce((a, w) => a + w.forgetCount, 0),
    forgetRate: ofKnown.length ? ofKnown.filter((l) => l.rating === "again").length / ofKnown.length : null,
    learningSuccess: ofLearning.length ? ofLearning.filter((l) => l.rating !== "again").length / ofLearning.length : null,
    sample: ofKnown.length,
  };
}

export interface LessonPlan {
  /** Mots nouveaux par leçon. */
  newPerLesson: number;
  /** Révisions : mots appris / mots en cours (total REVIEWS_PER_LESSON). */
  reviewLearned: number;
  reviewLearning: number;
  /** Pourquoi, en clair. */
  reason: string;
}

/** Le plan des leçons, réglé par la mémoire. */
export function lessonPlan(m: MemoryStats): LessonPlan {
  const half = REVIEWS_PER_LESSON / 2;
  if (m.forgetRate === null || m.sample < MIN_SAMPLE) {
    return {
      newPerLesson: BASE_NEW_PER_LESSON,
      reviewLearned: half,
      reviewLearning: half,
      reason: `Pas encore assez de révisions de mots appris (${m.sample}/${MIN_SAMPLE}) pour mesurer ton taux d’oubli : rythme de base.`,
    };
  }
  const gap = m.forgetRate - TARGET_FORGET;
  // Plus d'oubli → plus de mots appris à revoir (30 % à 70 % des révisions)…
  const learnedShare = clamp(0.5 + gap * 2, 0.3, 0.7);
  // … et moins de mots nouveaux (4 à 12 par leçon).
  let newPer = Math.round(clamp(BASE_NEW_PER_LESSON * (1 - gap * 3), 4, 12));
  let backlog = "";
  if (m.learning > BACKLOG_LIMIT) {
    newPer = Math.min(newPer, 5);
    backlog = ` ${m.learning} mots en cours : on consolide avant d’en ajouter.`;
  }
  const reviewLearned = Math.round(REVIEWS_PER_LESSON * learnedShare);
  const pct = Math.round(m.forgetRate * 100);
  return {
    newPerLesson: newPer,
    reviewLearned,
    reviewLearning: REVIEWS_PER_LESSON - reviewLearned,
    reason:
      (gap > 0.02
        ? `Tu oublies ${pct} % des mots appris (14 jours) : plus de révisions de mots appris, moins de mots nouveaux.`
        : gap < -0.02
          ? `Tu oublies seulement ${pct} % des mots appris (14 jours) : on peut avancer plus vite.`
          : `Taux d’oubli de ${pct} % (14 jours), dans la norme : rythme de base.`) + backlog,
  };
}

export async function currentPlan(userId: string): Promise<LessonPlan> {
  return lessonPlan(await memoryStats(userId));
}

export interface HardWord {
  entryId: number;
  ru: string;
  gloss: string;
  forgetCount: number;
  relearnCount: number;
  /** Appris en ce moment, ou à réapprendre. */
  known: boolean;
}

/** Les mots qui s'oublient le plus : à travailler autrement (phrase, image, famille de mots). */
export async function hardWords(userId: string, limit = 12): Promise<HardWord[]> {
  const words = await prisma.word.findMany({
    where: { userId, forgetCount: { gte: 2 } },
    orderBy: [{ forgetCount: "desc" }, { lastForgottenAt: "desc" }],
    take: limit,
    select: {
      entryId: true,
      status: true,
      forgetCount: true,
      relearnCount: true,
      entry: { select: { accented: true, glossFr: true, translationsFr: true, translationsEn: true } },
    },
  });
  return words.map((w) => ({
    entryId: w.entryId,
    ru: accent(w.entry.accented),
    gloss: shortGloss(w.entry),
    forgetCount: w.forgetCount,
    relearnCount: w.relearnCount,
    known: w.status === "KNOWN",
  }));
}
