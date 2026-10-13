-- CreateTable
CREATE TABLE "ReadingText" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "unitId" TEXT,
    "purpose" TEXT,
    "forDay" TEXT,
    "difficulty" REAL,
    "attribution" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "analysis" TEXT,
    "analysisVersion" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "userId" TEXT NOT NULL,
    "textId" INTEGER NOT NULL,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "textId"),
    CONSTRAINT "ReadingProgress_textId_fkey" FOREIGN KEY ("textId") REFERENCES "ReadingText" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnitProgress" (
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "score" REAL,

    PRIMARY KEY ("userId", "unitId")
);

-- CreateTable
CREATE TABLE "ReaderReview" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ease" REAL NOT NULL DEFAULT 2.5,
    "intervalDays" REAL NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "key")
);

-- CreateIndex
CREATE INDEX "ReadingText_userId_createdAt_idx" ON "ReadingText"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReadingText_source_idx" ON "ReadingText"("source");

-- CreateIndex
CREATE INDEX "ReadingText_userId_purpose_forDay_idx" ON "ReadingText"("userId", "purpose", "forDay");

-- CreateIndex
CREATE INDEX "ReaderReview_userId_dueAt_idx" ON "ReaderReview"("userId", "dueAt");

