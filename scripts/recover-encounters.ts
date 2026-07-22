// Recovery: re-link orphaned encounters (entryId NULL) to the current dictionary, using
// the preserved rawInput + matchedFormKey. A re-seed had set entryId NULL when entries
// were deleted; this restores the collection without rolling back the dictionary.
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBare } from "../src/lib/grammar";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  }),
});

// он & co. changed from prn_* keys to decl_* — remap so the discovered cell still matches.
function remapKey(forms: { formKey: string }[], key: string | null): string | null {
  if (!key) return key;
  if (forms.some((f) => f.formKey === key)) return key;
  const m = /^prn_(nom|gen|dat|acc|inst|prep)$/.exec(key);
  if (m && forms.some((f) => f.formKey === `decl_m_${m[1]}`)) return `decl_m_${m[1]}`;
  return key;
}

async function main() {
  const orphans = await prisma.encounter.findMany({ where: { entryId: null } });
  let linked = 0;
  const unresolved: string[] = [];

  for (const e of orphans) {
    const norm = normalizeBare(e.rawInput);
    let entryId: number | null = null;
    let newKey = e.matchedFormKey;

    // 1) Prefer a form matching both the word and the recorded cell.
    if (e.matchedFormKey) {
      const exact = await prisma.dictionaryForm.findFirst({
        where: { bareForm: norm, formKey: e.matchedFormKey },
      });
      if (exact) entryId = exact.entryId;
    }
    // 2) Any inflected form of that word.
    if (entryId === null) {
      const anyForm = await prisma.dictionaryForm.findFirst({ where: { bareForm: norm } });
      if (anyForm) entryId = anyForm.entryId;
    }
    // 3) Base / dictionary form (invariables, infinitives).
    if (entryId === null) {
      const lemma = await prisma.dictionaryEntry.findFirst({ where: { bare: norm } });
      if (lemma) entryId = lemma.id;
    }

    if (entryId === null) {
      unresolved.push(e.rawInput);
      continue;
    }
    const forms = await prisma.dictionaryForm.findMany({
      where: { entryId },
      select: { formKey: true },
    });
    newKey = remapKey(forms, e.matchedFormKey);
    await prisma.encounter.update({
      where: { id: e.id },
      data: { entryId, matchedFormKey: newKey },
    });
    linked++;
  }

  console.log(`[recover] re-linked ${linked}/${orphans.length} encounters.`);
  if (unresolved.length) console.log(`[recover] non résolus : ${unresolved.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
