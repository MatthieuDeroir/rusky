// Dev utility: print the grammar-rule note for a sample of words across types.
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  analyzeAdjective,
  analyzeNoun,
  analyzeNumeral,
  analyzePronoun,
  analyzeVerb,
} from "../src/lib/morphology";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  }),
});

const SAMPLES: [string, string][] = [
  ["есть", "verb"],
  ["хотеть", "verb"],
  ["читать", "verb"],
  ["говорить", "verb"],
  ["книга", "noun"],
  ["время", "noun"],
  ["красивый", "adjective"],
  ["пять", "numeral"],
  ["два", "numeral"],
  ["один", "numeral"],
  ["я", "pronoun"],
  ["наш", "pronoun"],
];

async function main() {
  for (const [bare, type] of SAMPLES) {
    const e = await prisma.dictionaryEntry.findFirst({ where: { bare, type } });
    if (!e) {
      console.log(`\n${bare} (${type}) — introuvable`);
      continue;
    }
    const rows = await prisma.dictionaryForm.findMany({ where: { entryId: e.id } });
    const forms = new Map<string, string[]>();
    for (const r of rows) {
      const a = forms.get(r.formKey) ?? [];
      a.push(r.accented);
      forms.set(r.formKey, a);
    }
    let rules;
    if (type === "verb") rules = analyzeVerb(e.accented, forms);
    else if (type === "noun") rules = analyzeNoun(e.gender, forms, e.indeclinable, e.plOnly);
    else if (type === "adjective") rules = analyzeAdjective(forms);
    else if (type === "numeral") rules = analyzeNumeral(forms);
    else rules = analyzePronoun(forms);

    console.log(`\n=== ${e.accented} (${type}) ===`);
    for (const [section, lines] of Object.entries(rules)) {
      console.log(`  [${section}]`);
      lines.forEach((l) => console.log("    • " + l));
    }
  }
}

main().finally(() => prisma.$disconnect());
