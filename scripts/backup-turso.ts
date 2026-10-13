// Dump complet de la base Turso (production) en SQL rejouable, sans passer par la CLI turso
// (qui demande un login interactif). À lancer AVANT toute migration de la base distante.
//
//   npx tsx scripts/backup-turso.ts            # → prisma/backups/turso-rusky-<stamp>.sql
//
// Lit TURSO_DATABASE_URL / TURSO_AUTH_TOKEN depuis l'env file TURSO_ENV (défaut .env).
// Pagination par rowid pour ne jamais charger une table entière (DictionaryForm ≈ 760k lignes).
import { createClient, type InValue } from "@libsql/client";
import { config } from "dotenv";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";

config({ path: process.env.TURSO_ENV ?? ".env" });

const PAGE = 5000;

function sqlValue(v: InValue | undefined): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer);
    return `X'${Buffer.from(bytes).toString("hex")}'`;
  }
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL manquant");
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const dir = join("prisma", "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `turso-rusky-${stamp}.sql`);
  const out = createWriteStream(file);
  out.write("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n");

  const schema = await db.execute(
    "select type, name, sql from sqlite_master where sql is not null and name not like 'sqlite_%' and name not like '_litestream%' and name not like 'libsql_%' order by type = 'table' desc, name",
  );
  const tables = schema.rows.filter((r) => r.type === "table");
  const total: Record<string, number> = {};

  for (const t of tables) {
    const name = String(t.name);
    out.write(`${t.sql};\n`);
    let last = -Infinity;
    let n = 0;
    for (;;) {
      const page = await db.execute({
        sql: `select rowid as __rowid, * from "${name}" where rowid > ? order by rowid limit ${PAGE}`,
        args: [Number.isFinite(last) ? last : -9e15],
      });
      if (page.rows.length === 0) break;
      const cols = page.columns.filter((c) => c !== "__rowid");
      const colList = cols.map((c) => `"${c}"`).join(",");
      for (const row of page.rows) {
        out.write(`INSERT INTO "${name}" (${colList}) VALUES(${cols.map((c) => sqlValue(row[c] as InValue)).join(",")});\n`);
      }
      last = Number(page.rows[page.rows.length - 1].__rowid);
      n += page.rows.length;
      if (page.rows.length < PAGE) break;
    }
    total[name] = n;
    console.log(`  ${name}: ${n}`);
  }
  for (const r of schema.rows.filter((r) => r.type !== "table")) out.write(`${r.sql};\n`);
  out.write("COMMIT;\n");
  await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
  console.log(`[backup-turso] ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
