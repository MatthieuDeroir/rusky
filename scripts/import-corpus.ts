// Importe le corpus de lecture (data/corpus/*.json) en textes partagés (ReadingText, userId null,
// source 'corpus'). Idempotent : un texte déjà présent (même titre) est ignoré, rien n'est jamais
// modifié ni supprimé. L'analyse IA se fait à la première ouverture du texte, pas ici.
//
//   npx tsx scripts/import-corpus.ts            # base pointée par .env (Turso si configuré)
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });

interface CorpusFile {
  source: string;
  texts: { title: string; genre: string | null; body: string }[];
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const dir = join("data", "corpus");
  let created = 0;
  let skipped = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as CorpusFile;
    const existing = new Set(
      (await prisma.readingText.findMany({ where: { source: "corpus", userId: null }, select: { title: true } })).map((t) => t.title),
    );
    for (const t of data.texts) {
      if (existing.has(t.title)) {
        skipped++;
        continue;
      }
      await prisma.readingText.create({
        data: { userId: null, source: "corpus", title: t.title, body: t.body, attribution: data.source },
      });
      created++;
    }
  }
  console.log(`[import-corpus] ${created} texte(s) ajouté(s), ${skipped} déjà présent(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
