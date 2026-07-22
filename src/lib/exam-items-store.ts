// Server-side store for the correct answers of generated QCM (Лексика-Грамматика). The client
// receives only the questions/options + a token; the correct indices stay here so they can't be
// read from the page. Now in the DB (table ExamItem), scoped per user and pruned to the latest.
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const MAX = 100; // keep only the most recent tokens per user

export async function saveMcqKey(userId: string, correct: number[]): Promise<string> {
  const token = randomUUID();
  await prisma.examItem.create({
    data: { token, userId, correct: JSON.stringify(correct) },
  });
  // Prune this user's oldest tokens beyond MAX.
  const stale = await prisma.examItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: MAX,
    select: { token: true },
  });
  if (stale.length > 0) {
    await prisma.examItem.deleteMany({
      where: { token: { in: stale.map((s) => s.token) } },
    });
  }
  return token;
}

export async function getMcqKey(userId: string, token: string): Promise<number[] | null> {
  const row = await prisma.examItem.findUnique({ where: { token } });
  if (!row || row.userId !== userId) return null;
  try {
    return JSON.parse(row.correct) as number[];
  } catch {
    return null;
  }
}
