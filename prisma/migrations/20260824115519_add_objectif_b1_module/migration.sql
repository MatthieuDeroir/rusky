-- AlterTable
ALTER TABLE "UserStats" ADD COLUMN "b1TargetDate" DATETIME;

-- CreateTable
CREATE TABLE "TrkiPaper" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "blueprintVersion" TEXT NOT NULL,
    "subtests" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'EXAM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" DATETIME
);

-- CreateTable
CREATE TABLE "TrkiPassage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "paperId" INTEGER NOT NULL,
    "subtest" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "TrkiPassage_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "TrkiPaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrkiBankItem" (
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
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrkiItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "paperId" INTEGER NOT NULL,
    "passageId" INTEGER,
    "bankItemId" INTEGER,
    "subtest" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "TrkiItem_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "TrkiPaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrkiItem_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "TrkiPassage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrkiItem_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "TrkiBankItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrkiAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "paperId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "TrkiAttempt_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "TrkiPaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrkiResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "attemptId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN,
    "feedback" TEXT,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrkiResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TrkiAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrkiResponse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrkiItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrkiSubtestResult" (
    "attemptId" INTEGER NOT NULL,
    "subtest" TEXT NOT NULL,
    "rawScore" REAL NOT NULL,
    "maxScore" REAL NOT NULL,
    "ratio" REAL NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "bankedUntil" DATETIME,
    "rubric" TEXT,

    PRIMARY KEY ("attemptId", "subtest"),
    CONSTRAINT "TrkiSubtestResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TrkiAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrkiFocusCache" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "signature" TEXT NOT NULL,
    "reco" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "B1VocabDay" (
    "userId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "entryIds" TEXT NOT NULL,
    "introducedAt" DATETIME,

    PRIMARY KEY ("userId", "dayIndex")
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DictionaryEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bare" TEXT NOT NULL,
    "accented" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gender" TEXT,
    "aspect" TEXT,
    "animate" BOOLEAN,
    "indeclinable" BOOLEAN,
    "sgOnly" BOOLEAN,
    "plOnly" BOOLEAN,
    "comparative" TEXT,
    "superlative" TEXT,
    "partner" TEXT,
    "translationsFr" TEXT,
    "frManual" BOOLEAN NOT NULL DEFAULT false,
    "frChecked" BOOLEAN NOT NULL DEFAULT false,
    "deeplChecked" BOOLEAN NOT NULL DEFAULT false,
    "translationsEn" TEXT,
    "translationsDe" TEXT,
    "inB1Minimum" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_DictionaryEntry" ("accented", "animate", "aspect", "bare", "comparative", "deeplChecked", "frChecked", "frManual", "gender", "id", "indeclinable", "partner", "plOnly", "sgOnly", "superlative", "translationsDe", "translationsEn", "translationsFr", "type") SELECT "accented", "animate", "aspect", "bare", "comparative", "deeplChecked", "frChecked", "frManual", "gender", "id", "indeclinable", "partner", "plOnly", "sgOnly", "superlative", "translationsDe", "translationsEn", "translationsFr", "type" FROM "DictionaryEntry";
DROP TABLE "DictionaryEntry";
ALTER TABLE "new_DictionaryEntry" RENAME TO "DictionaryEntry";
CREATE INDEX "DictionaryEntry_bare_idx" ON "DictionaryEntry"("bare");
CREATE INDEX "DictionaryEntry_type_idx" ON "DictionaryEntry"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TrkiPaper_userId_idx" ON "TrkiPaper"("userId");

-- CreateIndex
CREATE INDEX "TrkiPaper_userId_status_idx" ON "TrkiPaper"("userId", "status");

-- CreateIndex
CREATE INDEX "TrkiPassage_paperId_idx" ON "TrkiPassage"("paperId");

-- CreateIndex
CREATE INDEX "TrkiBankItem_typeId_targetId_idx" ON "TrkiBankItem"("typeId", "targetId");

-- CreateIndex
CREATE INDEX "TrkiBankItem_contentHash_idx" ON "TrkiBankItem"("contentHash");

-- CreateIndex
CREATE INDEX "TrkiBankItem_quarantined_idx" ON "TrkiBankItem"("quarantined");

-- CreateIndex
CREATE INDEX "TrkiItem_paperId_idx" ON "TrkiItem"("paperId");

-- CreateIndex
CREATE INDEX "TrkiItem_passageId_idx" ON "TrkiItem"("passageId");

-- CreateIndex
CREATE INDEX "TrkiItem_bankItemId_idx" ON "TrkiItem"("bankItemId");

-- CreateIndex
CREATE INDEX "TrkiAttempt_userId_idx" ON "TrkiAttempt"("userId");

-- CreateIndex
CREATE INDEX "TrkiAttempt_paperId_idx" ON "TrkiAttempt"("paperId");

-- CreateIndex
CREATE INDEX "TrkiResponse_attemptId_idx" ON "TrkiResponse"("attemptId");

-- CreateIndex
CREATE INDEX "TrkiResponse_itemId_idx" ON "TrkiResponse"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "TrkiResponse_attemptId_itemId_key" ON "TrkiResponse"("attemptId", "itemId");
