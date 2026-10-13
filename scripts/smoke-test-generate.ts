// Smoke test de la génération de textes du Lecteur (vraie IA) sur la base pointée par l'env.
//
//   TURSO_DATABASE_URL=file:./prisma/dev.db npx tsx scripts/smoke-test-generate.ts [unitId] [purpose]
// Crée des textes génériques (userId "smoke-test"), affiche le résultat, puis les supprime.
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { createGeneratedPlaceholder, fillGeneratedText } = await import("../src/lib/reader/generate");
  const { findUnit } = await import("../src/lib/reader/curriculum");
  const unitId = process.argv[2] ?? "u02-genitif";
  const purposes = (process.argv[3] ? [process.argv[3]] : ["daily", "decode"]) as ("daily" | "decode" | "unit")[];
  const level = findUnit(unitId)?.n ?? 1;
  for (const purpose of purposes) {
    const t0 = Date.now();
    const id = await createGeneratedPlaceholder("smoke-test", { purpose, unitId, level });
    await fillGeneratedText(id, { purpose, unitId, level });
    const t = await prisma.readingText.findUniqueOrThrow({ where: { id } });
    const a = t.analysis ? JSON.parse(t.analysis) : null;
    console.log(`\n=== ${purpose} (${unitId}) — ${t.status} en ${Date.now() - t0} ms, difficulté ${t.difficulty?.toFixed(2)}`);
    console.log(`« ${t.title} »\n${t.body}`);
    const structures = new Set<string>();
    for (const p of a?.paragraphs ?? []) for (const s of p.sentences ?? []) s.structures.forEach((x: string) => structures.add(x));
    console.log("structures repérées :", [...structures].join(", "));
    const qs = (a?.paragraphs ?? []).flatMap((p: { questions: { q: string }[] }) => p.questions);
    console.log("questions :", qs.map((q: { q: string }) => q.q).join(" | "));
    await prisma.readingText.delete({ where: { id } });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
