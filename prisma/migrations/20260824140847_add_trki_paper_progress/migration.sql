-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrkiPaper" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "blueprintVersion" TEXT NOT NULL,
    "subtests" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'EXAM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "totalSlots" INTEGER,
    "resolvedSlots" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" DATETIME
);
INSERT INTO "new_TrkiPaper" ("blueprintVersion", "createdAt", "error", "id", "purpose", "readyAt", "seed", "status", "subtests", "userId") SELECT "blueprintVersion", "createdAt", "error", "id", "purpose", "readyAt", "seed", "status", "subtests", "userId" FROM "TrkiPaper";
DROP TABLE "TrkiPaper";
ALTER TABLE "new_TrkiPaper" RENAME TO "TrkiPaper";
CREATE INDEX "TrkiPaper_userId_idx" ON "TrkiPaper"("userId");
CREATE INDEX "TrkiPaper_userId_status_idx" ON "TrkiPaper"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
