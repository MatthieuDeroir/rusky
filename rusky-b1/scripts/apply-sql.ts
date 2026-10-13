// Applique un fichier SQL à la base Turso de Rusky B1 (.env.production.local).
// Refuse toute instruction destructive (DROP, DELETE, TRUNCATE, UPDATE sans WHERE).
//   npx tsx scripts/apply-sql.ts prisma/upgrade-legacy-copy.sql
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { createClient } from "@libsql/client";

const env = parse(readFileSync(".env.production.local"));
const url = env.TURSO_DATABASE_URL;
if (!url?.includes("rusky-b1")) throw new Error(`Cible inattendue : ${url}`);
const sql = readFileSync(process.argv[2], "utf8");
const stmts = sql
  .split(/;\s*\n/)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);
for (const s of stmts) {
  if (/^\s*(drop|delete|truncate)\b/i.test(s) || /^\s*update\b(?![\s\S]*\bwhere\b)/i.test(s) || /alter\s+table[\s\S]*\bdrop\b/i.test(s))
    throw new Error(`Instruction refusée : ${s.slice(0, 80)}`);
}
(async () => {
  const c = createClient({ url, authToken: env.TURSO_AUTH_TOKEN });
  await c.batch(stmts, "write");
  console.log(`${stmts.length} instructions appliquées à ${url}`);
})();
