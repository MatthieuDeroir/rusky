// Smoke test du Lecteur : analyse des phrases pièges (ambiguïtés de cas, ordre OVS, который,
// participe, impersonnel) avec la vraie IA, sans rien écrire en base.
//
//   TURSO_DATABASE_URL=file:./prisma/dev.db npx tsx scripts/smoke-test-reader.ts ["texte"]
import { config } from "dotenv";
config({ path: ".env" });

const DEFAULT = [
  "Машу любит Петя.",
  "У моего брата нет книги, но он читает книги каждый день.",
  "Девушка, которой я подарил цветы, живёт в доме, построенном в прошлом веке.",
  "Мне холодно, потому что окно открыто.",
  "Вернувшись домой, отец сел за стол и начал писать письмо.",
].join(" ");

async function main() {
  const { analyzeParagraph, lookupCandidates } = await import("../src/lib/reader/analyze");
  const { tokenize } = await import("../src/lib/reader/segment");
  const { normalizeBare } = await import("../src/lib/grammar");
  const text = process.argv[2] ?? DEFAULT;
  const norms = [...new Set(tokenize(text).filter((t) => t.word).map((t) => normalizeBare(t.t)))];
  const t0 = Date.now();
  const cands = await lookupCandidates(norms);
  const para = await analyzeParagraph(text, 0, cands);
  console.log(`(${Date.now() - t0} ms, failed=${!!para.failed})\n`);
  for (const s of para.sentences ?? []) {
    console.log("▶", s.tokens.map((t) => t.t).join(""));
    console.log("  FR :", s.translation);
    console.log("  mot à mot :", s.literal);
    console.log("  squelette :", s.skeleton);
    if (s.clauses.length) console.log("  propositions :", s.clauses.map((c) => `${c.kind}[${c.from}-${c.to}]`).join(", "));
    console.log("  structures :", s.structures.join(", "));
    for (const w of s.words) {
      console.log(
        `   ${w.verified ? "✓" : "?"} ${w.raw.padEnd(12)} ${w.role.padEnd(11)} ${w.lemma} — ${w.formLabel} — « ${w.gloss} » — ${w.reason}`,
      );
    }
    console.log();
  }
  for (const q of para.questions) {
    console.log(`Q (après ${q.afterSentence}) ${q.q}`);
    q.options.forEach((o, i) => console.log(`   ${i === q.answer ? "*" : " "} ${o}`));
    console.log(`   → ${q.explain}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
