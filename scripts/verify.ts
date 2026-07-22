// Dev utility: sanity-check the seeded dictionary and the normalize/lookup logic.
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBare, describeFormKey } from "../src/lib/grammar";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const SAMPLES = ["книги", "читал", "красивая", "меня", "пяти", "него", "два", "тот", "и"];

async function main() {
  for (const w of SAMPLES) {
    const norm = normalizeBare(w);
    const forms = await prisma.dictionaryForm.findMany({
      where: { bareForm: norm },
      include: { entry: true },
      take: 8,
    });
    const lemmas = await prisma.dictionaryEntry.findMany({
      where: { bare: norm },
      take: 5,
    });
    const out = forms.map(
      (f) => `${f.entry.accented} [${f.entry.type}] ${describeFormKey(f.formKey)}`,
    );
    const lemmaOut = lemmas.map((l) => `${l.accented} [${l.type}] base`);
    console.log(`\n=== "${w}" (norm: ${norm}) ===`);
    [...new Set([...out, ...lemmaOut])].forEach((l) => console.log("  - " + l));
    if (out.length === 0 && lemmaOut.length === 0) console.log("  (no match)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
