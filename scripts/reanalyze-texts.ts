// Ré-analyse complète de textes du Lecteur (après une amélioration du pipeline d'analyse).
// Refuse un texte qui a déjà des réponses enregistrées : les identifiants de questions
// changeraient et les réponses deviendraient orphelines.
//
//   npx tsx scripts/reanalyze-texts.ts <id> [<id>…]     # après scripts/backup-turso.ts
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { runAnalysis } = await import("../src/lib/reader/analyze");
  const ids = process.argv.slice(2).map(Number).filter(Number.isInteger);
  for (const id of ids) {
    const answered = await prisma.readingProgress.findMany({ where: { textId: id, NOT: { answers: "{}" } } });
    if (answered.length) {
      console.log(`  ${id} ignoré : des réponses existent déjà`);
      continue;
    }
    await prisma.readingText.update({ where: { id }, data: { analysis: null, analysisVersion: null, status: "PENDING" } });
  }
  await Promise.all(ids.map((id) => runAnalysis(id)));
  for (const t of await prisma.readingText.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, title: true } }))
    console.log(`  ${t.id} ${t.status} ${t.title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
