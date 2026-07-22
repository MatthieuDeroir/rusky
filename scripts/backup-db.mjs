// Backs up the SQLite database before any destructive operation (migrate / seed).
// Per project rule: ALWAYS back up the DB before modifying it.
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEEP = 2; // most recent automatic backups to retain (each can be ~100 MB)

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = join(root, "prisma", "dev.db");
const backupDir = join(root, "prisma", "backups");

if (!existsSync(dbPath)) {
  console.log("[db:backup] No prisma/dev.db yet — nothing to back up.");
  process.exit(0);
}

mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = join(backupDir, `dev-${stamp}.db`);
copyFileSync(dbPath, dest);
console.log(`[db:backup] Backed up dev.db -> prisma/backups/dev-${stamp}.db`);

// Prune oldest automatic backups (keep the newest KEEP). ISO-timestamp names sort chronologically.
const autos = readdirSync(backupDir)
  .filter((f) => f.startsWith("dev-") && f.endsWith(".db"))
  .sort();
for (const f of autos.slice(0, Math.max(0, autos.length - KEEP))) {
  unlinkSync(join(backupDir, f));
}
