import "server-only";
import { prisma } from "@/lib/db";
import { parisDay, parisYesterday } from "@/lib/dates";

// XP awarded per activity. Kept modest so the daily goal (default 50) means ~a handful of
// exercises — same feel as Duolingo, tuned for this app's exercise types.
export const XP = {
  quiz: 5, // filled a blank cell in practice
  complete: 4, // completed a paradigm cell on the word page
  translate: 8, // correct translation (either direction)
  case: 5, // correct "which case?" answer
  speak: 6, // correct pronunciation
  sentence: 10, // a sentence checked with no issue
  discover: 3, // a new word/form encountered
  control: 40, // passed a level control (declension/conjugation/vocabulary)
  torfl: 60, // passed a TORFL épreuve
  review: 4, // an SRS review answered
  bonus: 0,
} as const;

export type XpSource = keyof typeof XP;

const FREEZE_MAX = 5;

/** Ensure a UserStats row exists (created lazily, never overwritten). */
async function ensureStats(userId: string) {
  const s = await prisma.userStats.findUnique({ where: { userId } });
  if (s) return s;
  return prisma.userStats.upsert({ where: { userId }, update: {}, create: { userId } });
}

/**
 * Count today's activity toward the streak, independently of any XP goal: as soon as one
 * exercise is done, the streak advances. A missed day can be covered by a streak freeze.
 * No-op if today's activity is already recorded.
 */
export async function markActivity(userId: string, now: Date = new Date()) {
  const today = parisDay(now);
  const stats = await ensureStats(userId);
  if (stats.lastActivityDate === today) return;

  const yesterday = parisYesterday(now);
  let streak: number;
  let freezes = stats.streakFreezes;

  if (stats.lastActivityDate === yesterday) {
    streak = stats.currentStreak + 1;
  } else if (stats.lastActivityDate) {
    // Missed day(s): a freeze covers a single day of absence.
    const missedOneDay =
      parisYesterday(new Date(now.getTime() - 24 * 60 * 60 * 1000)) === stats.lastActivityDate;
    if (missedOneDay && freezes > 0) {
      freezes -= 1;
      streak = stats.currentStreak + 1;
    } else {
      streak = 1;
    }
  } else {
    streak = 1;
  }

  // +1 freeze every 7 days of streak.
  if (streak > 0 && streak % 7 === 0) freezes = Math.min(FREEZE_MAX, freezes + 1);

  await prisma.userStats.update({
    where: { userId },
    data: {
      currentStreak: streak,
      longestStreak: Math.max(stats.longestStreak, streak),
      lastActivityDate: today,
      streakFreezes: freezes,
    },
  });
}

export interface XpAward {
  xpGained: number;
  todayXp: number;
  goalReached: boolean;
  goal: number;
}

/** Add XP, update the total, and count today's activity for the streak. */
export async function addXp(userId: string, source: XpSource, amount = XP[source]): Promise<XpAward> {
  const now = new Date();
  const today = parisDay(now);

  const stats = await ensureStats(userId);
  await prisma.xpEvent.create({ data: { userId, amount, source, day: today } });
  await prisma.userStats.update({
    where: { userId },
    data: { totalXp: stats.totalXp + amount, totalAttempts: { increment: 1 } },
  });
  await markActivity(userId, now);

  const todayXp = await getTodayXp(userId);
  const goal = stats.dailyXpGoal;
  return { xpGained: amount, todayXp, goalReached: todayXp >= goal, goal };
}

export async function getTodayXp(userId: string): Promise<number> {
  const agg = await prisma.xpEvent.aggregate({
    where: { userId, day: parisDay() },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export interface GameStats {
  totalXp: number;
  todayXp: number;
  goal: number;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  lastActivityDate: string | null;
}

/** Everything the dashboard/profile needs, in one call. */
export async function getGameStats(userId: string): Promise<GameStats> {
  const stats = await ensureStats(userId);
  const todayXp = await getTodayXp(userId);
  return {
    totalXp: stats.totalXp,
    todayXp,
    goal: stats.dailyXpGoal,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    streakFreezes: stats.streakFreezes,
    lastActivityDate: stats.lastActivityDate,
  };
}

/** Set the daily XP goal (profile editor). Clamped to a sensible range. */
export async function setDailyGoal(userId: string, goal: number): Promise<number> {
  const clamped = Math.max(10, Math.min(200, Math.round(goal)));
  await ensureStats(userId);
  await prisma.userStats.update({ where: { userId }, data: { dailyXpGoal: clamped } });
  return clamped;
}
