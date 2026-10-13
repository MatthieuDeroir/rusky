// Retire des analyses déjà en base les questions de structure qui affirment un cas faux ou
// invérifiable (voir questionPremiseOk). Ne touche qu'au JSON ReadingText.analysis.
//
//   npx tsx scripts/clean-question-premises.ts            # dry run
//   npx tsx scripts/clean-question-premises.ts --apply    # après scripts/backup-turso.ts
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { questionPremiseOk } = await import("../src/lib/reader/analyze");
  const apply = process.argv.includes("--apply");
  const rows = await prisma.readingText.findMany({ where: { analysis: { not: null } }, select: { id: true, analysis: true } });
  for (const r of rows) {
    const a = JSON.parse(r.analysis!);
    let removed = 0;
    for (const p of a.paragraphs) {
      const words = (p.sentences ?? []).flatMap((s: { words: unknown[] }) => s.words);
      const keep = p.questions.filter((q: { q: string }) => questionPremiseOk(q.q, words));
      removed += p.questions.length - keep.length;
      for (const q of p.questions) if (!keep.includes(q)) console.log(`  ${r.id} − ${q.q}`);
      p.questions = keep;
    }
    if (removed && apply) await prisma.readingText.update({ where: { id: r.id }, data: { analysis: JSON.stringify(a) } });
  }
  console.log(apply ? "[clean] appliqué" : "[clean] dry run (ajoute --apply)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
