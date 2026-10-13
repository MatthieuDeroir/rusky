// Recopie les cartes vérifiées (glossFr / exampleRu / exampleFr) de la base locale vers la base
// Turso de Rusky B1. Ne touche qu'à ces trois colonnes, ligne par ligne (WHERE id = ?).
//   npx tsx scripts/push-enrichment.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { createClient } from "@libsql/client";

const env = parse(readFileSync(join(__dirname, "..", ".env.production.local")));
(async () => {
  const local = createClient({ url: `file:${join(__dirname, "..", "prisma/dev.db")}` });
  const remote = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  const rows = (await local.execute("select id, glossFr, exampleRu, exampleFr from DictionaryEntry where glossFr is not null")).rows;
  for (let i = 0; i < rows.length; i += 400) {
    await remote.batch(
      rows.slice(i, i + 400).map((r) => ({
        sql: "update DictionaryEntry set glossFr = ?, exampleRu = ?, exampleFr = ? where id = ?",
        args: [r.glossFr, r.exampleRu, r.exampleFr, r.id],
      })),
      "write",
    );
  }
  const check = await remote.execute("select count(*) n from DictionaryEntry where b1Rank is not null and glossFr is null");
  console.log(`${rows.length} cartes envoyées ; mots du parcours sans carte : ${check.rows[0].n}`);
})();
