// Bulk-copy all data from the local SQLite dev.db into the Turso database, over the normal
// libsql write path (Turso's file import is blocked on the starter plan). Rows are inserted in
// batches with explicit ids so foreign keys (Encounter.entryId, etc.) stay consistent.
//
// Idempotent / resumable: uses skipDuplicates, so re-running only fills what's missing.
//
// Usage:
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... tsx scripts/copy-to-turso.ts
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";

function client(url: string, authToken?: string) {
  return new PrismaClient({ adapter: new PrismaLibSql({ url, authToken }) });
}

const src = client("file:./prisma/dev.db");
const dest = client(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);

if (!process.env.TURSO_DATABASE_URL) {
  console.error("TURSO_DATABASE_URL is required");
  process.exit(1);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Copy one table using a delegate pair. `batch` = rows per INSERT (keep rows*cols < ~900).
async function copyTable<Row>(
  name: string,
  read: (skip: number, take: number) => Promise<Row[]>,
  count: () => Promise<number>,
  write: (rows: Row[]) => Promise<{ count: number }>,
  batch: number,
) {
  const total = await count();
  const destCount = await countDest(name);
  if (destCount >= total) {
    console.log(`= ${name}: already ${destCount}/${total}, skipping`);
    return;
  }
  console.log(`→ ${name}: ${total} rows (dest has ${destCount}, resuming)…`);
  const page = 5000;
  // Resume from what dest already has. Safe for id-ordered reads (parents/children) and for the
  // tiny unordered state tables (destCount is 0 or complete). skipDuplicates is unsupported on
  // SQLite/libsql, so we rely on the offset instead.
  let done = destCount;
  for (let skip = destCount; skip < total; skip += page) {
    const rows = await read(skip, page);
    for (const part of chunk(rows, batch)) {
      await write(part);
    }
    done += rows.length;
    process.stdout.write(`\r  ${name}: ${done}/${total}   `);
  }
  process.stdout.write("\n");
}

// Count via the dest delegate map (filled in main).
let countDest: (name: string) => Promise<number> = async () => 0;

async function main() {
  const destCounts: Record<string, () => Promise<number>> = {
    DictionaryEntry: () => dest.dictionaryEntry.count(),
    DictionaryForm: () => dest.dictionaryForm.count(),
    Encounter: () => dest.encounter.count(),
    QuizAttempt: () => dest.quizAttempt.count(),
    LevelProgress: () => dest.levelProgress.count(),
    TorflProgress: () => dest.torflProgress.count(),
    RecoCache: () => dest.recoCache.count(),
    ExamItem: () => dest.examItem.count(),
  };
  countDest = (n) => destCounts[n]();

  // Order matters: parents (DictionaryEntry) before children (DictionaryForm/Encounter/…).
  await copyTable(
    "DictionaryEntry",
    (skip, take) => src.dictionaryEntry.findMany({ orderBy: { id: "asc" }, skip, take }),
    () => src.dictionaryEntry.count(),
    (rows) => dest.dictionaryEntry.createMany({ data: rows}),
    150,
  );
  await copyTable(
    "DictionaryForm",
    (skip, take) => src.dictionaryForm.findMany({ orderBy: { id: "asc" }, skip, take }),
    () => src.dictionaryForm.count(),
    (rows) => dest.dictionaryForm.createMany({ data: rows}),
    500,
  );
  await copyTable(
    "Encounter",
    (skip, take) => src.encounter.findMany({ orderBy: { id: "asc" }, skip, take }),
    () => src.encounter.count(),
    (rows) => dest.encounter.createMany({ data: rows}),
    300,
  );
  await copyTable(
    "QuizAttempt",
    (skip, take) => src.quizAttempt.findMany({ orderBy: { id: "asc" }, skip, take }),
    () => src.quizAttempt.count(),
    (rows) => dest.quizAttempt.createMany({ data: rows}),
    300,
  );
  await copyTable(
    "LevelProgress",
    (skip, take) => src.levelProgress.findMany({ skip, take }),
    () => src.levelProgress.count(),
    (rows) => dest.levelProgress.createMany({ data: rows}),
    50,
  );
  await copyTable(
    "TorflProgress",
    (skip, take) => src.torflProgress.findMany({ skip, take }),
    () => src.torflProgress.count(),
    (rows) => dest.torflProgress.createMany({ data: rows}),
    50,
  );
  await copyTable(
    "RecoCache",
    (skip, take) => src.recoCache.findMany({ skip, take }),
    () => src.recoCache.count(),
    (rows) => dest.recoCache.createMany({ data: rows}),
    50,
  );
  await copyTable(
    "ExamItem",
    (skip, take) => src.examItem.findMany({ skip, take }),
    () => src.examItem.count(),
    (rows) => dest.examItem.createMany({ data: rows}),
    50,
  );

  console.log("All tables copied.");
}

main()
  .catch((e) => {
    console.error("\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await src.$disconnect();
    await dest.$disconnect();
  });
