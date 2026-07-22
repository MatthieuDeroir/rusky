import "server-only";
import { copyFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const KEEP = 25; // most recent automatic backups to retain (each can be ~100 MB)

/**
 * Copy the live SQLite DB into prisma/backups before any destructive write.
 * Per the project rule: ALWAYS back up the DB before modifying it — data loss is not
 * acceptable. Old automatic backups are pruned to the newest KEEP files.
 */
export async function backupDatabase(): Promise<string | null> {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = path.resolve(process.cwd(), url.replace(/^file:/, ""));
  if (!existsSync(dbPath)) return null;

  const backupDir = path.resolve(process.cwd(), "prisma", "backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `dev-${stamp}.db`);
  await copyFile(dbPath, dest);

  // Prune oldest automatic backups (keep the newest KEEP).
  try {
    const files = (await readdir(backupDir))
      .filter((f) => f.startsWith("dev-") && f.endsWith(".db"))
      .sort(); // ISO timestamp names sort chronologically
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
      await unlink(path.join(backupDir, f));
    }
  } catch {
    // pruning is best-effort; never block a backup on cleanup
  }

  return dest;
}
