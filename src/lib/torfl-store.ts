// Persistence for passed TORFL tasks — now in the DB (table TorflProgress), scoped per user.
// Moved off the JSON file so it works on Vercel and is isolated per Google account.
import { prisma } from "@/lib/db";

export async function getPassedTasks(userId: string): Promise<Set<string>> {
  const rows = await prisma.torflProgress.findMany({
    where: { userId },
    select: { taskId: true },
  });
  return new Set(rows.map((r) => r.taskId));
}

export async function recordPassedTask(
  userId: string,
  taskId: string,
): Promise<Set<string>> {
  await prisma.torflProgress.upsert({
    where: { userId_taskId: { userId, taskId } },
    update: {},
    create: { userId, taskId },
  });
  return getPassedTasks(userId);
}
