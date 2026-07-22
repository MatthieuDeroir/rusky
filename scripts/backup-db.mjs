// Backs up the SQLite database before any destructive operation (migrate / seed).
// Per project rule: ALWAYS back up the DB before modifying it.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
