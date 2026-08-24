-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrkiBankItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subtest" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "distractorClasses" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "validatedBy" TEXT NOT NULL,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TrkiBankItem" ("answerKey", "contentHash", "createdAt", "distractorClasses", "id", "lastUsedAt", "payload", "quarantined", "subtest", "targetId", "typeId", "usedCount", "validatedBy") SELECT "answerKey", "contentHash", "createdAt", "distractorClasses", "id", "lastUsedAt", "payload", "quarantined", "subtest", "targetId", "typeId", "usedCount", "validatedBy" FROM "TrkiBankItem";
DROP TABLE "TrkiBankItem";
ALTER TABLE "new_TrkiBankItem" RENAME TO "TrkiBankItem";
CREATE INDEX "TrkiBankItem_typeId_targetId_idx" ON "TrkiBankItem"("typeId", "targetId");
CREATE INDEX "TrkiBankItem_contentHash_idx" ON "TrkiBankItem"("contentHash");
CREATE INDEX "TrkiBankItem_quarantined_idx" ON "TrkiBankItem"("quarantined");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
