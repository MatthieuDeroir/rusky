import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { caseOf, normalizeBare, type CaseCode } from "../src/lib/grammar";
import { analyzeTokens, PREPOSITION_CASES, type Tok } from "../src/lib/sentence";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

async function check(sentence: string) {
  const raw = sentence.trim().split(/\s+/).filter(Boolean);
  const norms = raw.map((r) => normalizeBare(r.replace(/^[^\p{L}-]+|[^\p{L}-]+$/gu, "")));
  const uniq = [...new Set(norms.filter(Boolean))];
  const formRows = await prisma.dictionaryForm.findMany({
    where: { bareForm: { in: uniq } },
    select: { bareForm: true, formKey: true, entry: { select: { type: true, bare: true } } },
  });
  const lemmaRows = await prisma.dictionaryEntry.findMany({
    where: { bare: { in: uniq } },
    select: { bare: true, type: true },
  });
  const by = new Map<string, { cases: Set<CaseCode>; types: Set<string>; vl: Set<string> }>();
  const en = (n: string) => {
    let g = by.get(n);
    if (!g) by.set(n, (g = { cases: new Set(), types: new Set(), vl: new Set() }));
    return g;
  };
  for (const r of formRows) {
    const g = en(r.bareForm);
    const c = caseOf(r.formKey);
    if (c) g.cases.add(c);
    g.types.add(r.entry.type);
    if (r.entry.type === "verb") g.vl.add(r.entry.bare);
  }
  for (const r of lemmaRows) {
    const g = en(r.bare);
    g.types.add(r.type);
    if (r.type === "verb") g.vl.add(r.bare);
  }
  const toks: Tok[] = raw.map((rw, i) => {
    const n = norms[i];
    const info = by.get(n);
    const types = info?.types ?? new Set<string>();
    return {
      raw: rw,
      norm: n,
      recognized: !!info || PREPOSITION_CASES[n] != null,
      cases: info ? [...info.cases] : [],
      isNominal: ["noun", "adjective", "pronoun", "numeral"].some((t) => types.has(t)),
      isAdjective: types.has("adjective"),
      isNoun: types.has("noun"),
      verbLemmas: info ? [...info.vl] : [],
      prepCases: PREPOSITION_CASES[n] ?? null,
    };
  });
  const issues = analyzeTokens(toks);
  console.log(`\n« ${sentence} »`);
  if (issues.length === 0) console.log("  ✓ aucun problème");
  for (const is of issues) console.log("  ✗ " + is.message);
}

async function main() {
  await check("я читаю книгу"); // correct
  await check("я думаю о тебе"); // correct (о + prép)
  await check("я думаю о книгу"); // faux : о + accusatif
  await check("она помогает маме"); // correct (помогать + datif)
  await check("она помогает маму"); // faux : помогать + accusatif
  await check("красивую книгу"); // correct (acc + acc)
  await check("красивая книгу"); // faux : accord
  await check("я читаю блаблабла"); // mot inconnu
}

main().finally(() => prisma.$disconnect());
