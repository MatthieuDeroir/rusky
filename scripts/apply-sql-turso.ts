// Applique un fichier SQL de migration sur Turso (production) sans la CLI turso.
// Refuse tout SQL destructeur (DROP / DELETE / ALTER … DROP) : seuls les ajouts passent.
// TOUJOURS lancer scripts/backup-turso.ts avant.
//
//   npx tsx scripts/apply-sql-turso.ts prisma/migrations/<dossier>/migration.sql
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: process.env.TURSO_ENV ?? ".env" });

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage : apply-sql-turso.ts <fichier.sql>");
  const sql = readFileSync(file, "utf8");
  const code = sql.replace(/--.*$/gm, "");
  if (/^\s*(drop|delete|truncate|update)\b/im.test(code) || /alter\s+table[^;]*\bdrop\b/i.test(code)) throw new Error("SQL destructeur refusé (DROP/DELETE/TRUNCATE/UPDATE).");
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL manquant");
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await db.executeMultiple(sql);
  console.log(`[apply-sql-turso] ${file} appliqué.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
