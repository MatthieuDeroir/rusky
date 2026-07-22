// Dev utility: verify quiz answer-checking (accent-insensitive, variant-aware).
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBare } from "../src/lib/grammar";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

async function check(bare: string, type: string, formKey: string, answer: string) {
  const entry = await prisma.dictionaryEntry.findFirst({ where: { bare, type } });
  if (!entry) return console.log(`  ${bare}: entry not found`);
  const forms = await prisma.dictionaryForm.findMany({
    where: { entryId: entry.id, formKey },
  });
  const accepted = new Set(forms.map((f) => f.bareForm));
  const correct = accepted.has(normalizeBare(answer));
  console.log(
    `  ${bare} ${formKey}: answer "${answer}" -> ${correct ? "CORRECT" : "wrong"} (expected ${forms
      .map((f) => f.accented)
      .join(" / ")})`,
  );
}

async function main() {
  await check("книга", "noun", "sg_gen", "книги"); // correct, no accent
  await check("книга", "noun", "sg_gen", "книга"); // wrong (that's nominative)
  await check("я", "pronoun", "prn_inst", "мной"); // correct variant 1
  await check("я", "pronoun", "prn_inst", "мною"); // correct variant 2
  await check("пять", "numeral", "num_gen", "пяти"); // correct
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
