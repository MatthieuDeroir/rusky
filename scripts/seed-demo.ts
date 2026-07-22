// Dev-only: inserts a few sample encounters (one per word type) to exercise the read path.
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const SAMPLES: [string, string, string | null][] = [
  ["книга", "noun", "sg_gen"],
  ["читать", "verb", null],
  ["красивый", "adjective", "decl_f_nom"],
  ["я", "pronoun", "prn_inst"],
  ["пять", "numeral", "num_gen"],
];

async function main() {
  if (process.argv.includes("clear")) {
    const { count } = await prisma.encounter.deleteMany({ where: { source: "démo" } });
    console.log(`cleared ${count} démo encounters`);
    return;
  }
  for (const [bare, type, formKey] of SAMPLES) {
    const entry = await prisma.dictionaryEntry.findFirst({ where: { bare, type } });
    if (!entry) {
      console.log(`skip ${bare} (${type}) — not found`);
      continue;
    }
    await prisma.encounter.create({
      data: {
        entryId: entry.id,
        rawInput: bare,
        matchedFormKey: formKey,
        source: "démo",
      },
    });
    console.log(`+ encounter ${bare} [${type}] ${formKey ?? "base"} (entry ${entry.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
