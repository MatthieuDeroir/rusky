// One-shot import: reads data/B1/lexique_b1.json (word list extracted by the user from the
// official ТРКИ-1/B1 lexical minimum — see docs/adr/0003-source-allowlist-lexicale-b1.md) and
// flags matching DictionaryEntry rows as inB1Minimum = true. Never creates new DictionaryEntry
// rows (that needs a full paradigm, out of scope here) — unmatched lemmas are only logged.
//
// Run: npx tsx scripts/import-b1-lexicon.ts   — targets TURSO_DATABASE_URL when set in .env
// (production, shared with local dev per src/lib/db.ts), else the local prisma/dev.db file.
// Back up before running (npm run db:backup for local; turso db shell rusky .dump for Turso).

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { normalizeBare } from "../src/lib/grammar";

interface B1Entry {
  letter: string;
  page: number;
  headword: string;
  lemma: string;
  grammar: string;
  ru_raw: string;
  fr: string;
  subentries: string[];
}

async function main() {
  const path = join(process.cwd(), "data/B1/lexique_b1.json");
  const raw = readFileSync(path, "utf-8");
  const entries = JSON.parse(raw) as B1Entry[];

  console.log(`[import-b1-lexicon] ${entries.length} entrées lues depuis ${path}`);

  const byBare = new Map<string, B1Entry>();
  for (const e of entries) {
    const key = normalizeBare(e.lemma);
    if (!byBare.has(key)) byBare.set(key, e);
  }
  console.log(`[import-b1-lexicon] ${byBare.size} lemmes distincts après normalisation`);

  const dict = await prisma.dictionaryEntry.findMany({
    select: { id: true, bare: true, translationsFr: true, frManual: true },
  });
  const dictByBare = new Map<string, (typeof dict)[number][]>();
  for (const d of dict) {
    const arr = dictByBare.get(d.bare) ?? [];
    arr.push(d);
    dictByBare.set(d.bare, arr);
  }

  let matched = 0;
  let frBackfilled = 0;
  const unmatched: string[] = [];

  for (const [bare, entry] of byBare) {
    const candidates = dictByBare.get(bare);
    if (!candidates || candidates.length === 0) {
      unmatched.push(entry.lemma);
      continue;
    }
    for (const c of candidates) {
      matched++;
      const needsFr = !c.translationsFr?.trim() && !c.frManual;
      await prisma.dictionaryEntry.update({
        where: { id: c.id },
        data: {
          inB1Minimum: true,
          ...(needsFr && entry.fr?.trim() ? { translationsFr: entry.fr.trim() } : {}),
        },
      });
      if (needsFr && entry.fr?.trim()) frBackfilled++;
    }
  }

  console.log(`[import-b1-lexicon] ${matched} DictionaryEntry marquées inB1Minimum`);
  console.log(`[import-b1-lexicon] ${frBackfilled} translationsFr complétées depuis le champ fr`);
  console.log(`[import-b1-lexicon] ${unmatched.length} lemmes B1 sans correspondance en base`);
  if (unmatched.length > 0) {
    console.log(`[import-b1-lexicon] échantillon non matché (50 premiers) :`);
    console.log(unmatched.slice(0, 50).join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
