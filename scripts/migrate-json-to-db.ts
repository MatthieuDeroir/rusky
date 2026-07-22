// One-shot: import the legacy JSON state files (level-progress / torfl-progress / reco-cache /
// exam-items) into the DB tables, tagged with the "__legacy__" sentinel owner. These rows then
// travel with dev.db into Turso and are claimed by the owner account on first login.
//
// Idempotent: uses upserts / skipDuplicates, so re-running does no harm.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";

const LEGACY = "__legacy__";
const dir = path.resolve(process.cwd(), "prisma");

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./prisma/dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
});

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, name), "utf8")) as T;
  } catch {
    return null;
  }
}

async function main() {
  // 1. level-progress.json → LevelProgress
  const levels = await readJson<Record<string, number>>("level-progress.json");
  if (levels) {
    for (const [track, level] of Object.entries(levels)) {
      if (typeof level !== "number") continue;
      await prisma.levelProgress.upsert({
        where: { userId_track: { userId: LEGACY, track } },
        update: { level },
        create: { userId: LEGACY, track, level },
      });
    }
    console.log(`✓ level-progress: ${Object.keys(levels).length} tracks`);
  }

  // 2. torfl-progress.json → TorflProgress
  const torfl = await readJson<{ passed?: string[] }>("torfl-progress.json");
  if (torfl?.passed?.length) {
    for (const taskId of torfl.passed) {
      await prisma.torflProgress.upsert({
        where: { userId_taskId: { userId: LEGACY, taskId } },
        update: {},
        create: { userId: LEGACY, taskId },
      });
    }
    console.log(`✓ torfl-progress: ${torfl.passed.length} tasks`);
  }

  // 3. reco-cache.json → RecoCache
  const reco = await readJson<{ signature?: string; reco?: unknown }>("reco-cache.json");
  if (reco?.signature && reco.reco) {
    await prisma.recoCache.upsert({
      where: { userId: LEGACY },
      update: { signature: reco.signature, reco: JSON.stringify(reco.reco) },
      create: { userId: LEGACY, signature: reco.signature, reco: JSON.stringify(reco.reco) },
    });
    console.log("✓ reco-cache: 1 row");
  }

  // 4. exam-items.json → ExamItem
  const items = await readJson<Record<string, { correct: number[]; createdAt: number }>>(
    "exam-items.json",
  );
  if (items) {
    let n = 0;
    for (const [token, v] of Object.entries(items)) {
      await prisma.examItem.upsert({
        where: { token },
        update: {},
        create: {
          token,
          userId: LEGACY,
          correct: JSON.stringify(v.correct),
          createdAt: new Date(v.createdAt),
        },
      });
      n++;
    }
    console.log(`✓ exam-items: ${n} tokens`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
