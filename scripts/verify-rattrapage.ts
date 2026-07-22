import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

type Kind = "forme" | "ru-fr" | "fr-ru";
const TR_LEGACY = /^translate:(ru-fr|fr-ru)$/;
const canon = (fk: string) => (TR_LEGACY.test(fk) ? `${fk}:base` : fk);
const kindOf = (fk: string): Kind =>
  fk.startsWith("translate:ru-fr") ? "ru-fr" : fk.startsWith("translate:fr-ru") ? "fr-ru" : "forme";

async function main() {
  const attempts = await prisma.quizAttempt.findMany({
    orderBy: { createdAt: "asc" },
    select: { entryId: true, formKey: true, correct: true },
  });
  console.log(`Total attempts in DB: ${attempts.length}`);

  const latest = new Map<string, boolean>();
  for (const a of attempts) latest.set(`${a.entryId}|${canon(a.formKey)}`, a.correct);

  const counts: Record<Kind, number> = { forme: 0, "ru-fr": 0, "fr-ru": 0 };
  const sample: Record<Kind, string[]> = { forme: [], "ru-fr": [], "fr-ru": [] };
  for (const [key, correct] of latest) {
    if (correct) continue;
    const attemptKey = key.slice(key.indexOf("|") + 1);
    const k = kindOf(attemptKey);
    counts[k] += 1;
    if (sample[k].length < 3) sample[k].push(key);
  }
  console.log("Catch-up counts (latest attempt wrong):", counts);
  console.log("Samples:", sample);
}

main().finally(() => prisma.$disconnect());
