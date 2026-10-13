-- CreateTable
CREATE TABLE "DictionaryEntry" (
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
    "translationsEn" TEXT,
    "inB1Minimum" BOOLEAN NOT NULL DEFAULT false,
    "b1Rank" INTEGER,
    "glossFr" TEXT,
    "exampleRu" TEXT,
    "exampleFr" TEXT
);

-- CreateTable
CREATE TABLE "DictionaryForm" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "formKey" TEXT NOT NULL,
    "accented" TEXT NOT NULL,
    "bareForm" TEXT NOT NULL,
    "variantIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DictionaryForm_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("provider", "providerAccountId"),
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,

    PRIMARY KEY ("identifier", "token")
);

-- CreateTable
CREATE TABLE "Word" (
    "userId" TEXT NOT NULL,
    "entryId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LEARNING',
    "origin" TEXT NOT NULL DEFAULT 'learn',
    "ease" REAL NOT NULL DEFAULT 2.5,
    "intervalDays" REAL NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL,
    "lastReviewedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "knownAt" DATETIME,
    "source" TEXT,
    "context" TEXT,

    PRIMARY KEY ("userId", "entryId"),
    CONSTRAINT "Word_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Word_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "entryId" INTEGER NOT NULL,
    "rating" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "day" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Text" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "level" INTEGER,
    "attribution" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "analysis" TEXT,
    "analysisVersion" TEXT,
    "questions" TEXT,
    "forDay" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TextProgress" (
    "userId" TEXT NOT NULL,
    "textId" INTEGER NOT NULL,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "right" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "textId"),
    CONSTRAINT "TextProgress_textId_fkey" FOREIGN KEY ("textId") REFERENCES "Text" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayLog" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "newWords" INTEGER NOT NULL DEFAULT 0,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "textsRead" INTEGER NOT NULL DEFAULT 0,
    "readingRight" INTEGER NOT NULL DEFAULT 0,
    "readingTotal" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("userId", "day")
);

-- CreateTable
CREATE TABLE "Settings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "examDate" TEXT,
    "newPerDay" INTEGER NOT NULL DEFAULT 23,
    CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DictionaryEntry_bare_idx" ON "DictionaryEntry"("bare");

-- CreateIndex
CREATE INDEX "DictionaryEntry_inB1Minimum_b1Rank_idx" ON "DictionaryEntry"("inB1Minimum", "b1Rank");

-- CreateIndex
CREATE INDEX "DictionaryForm_bareForm_idx" ON "DictionaryForm"("bareForm");

-- CreateIndex
CREATE INDEX "DictionaryForm_entryId_idx" ON "DictionaryForm"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Word_userId_dueAt_idx" ON "Word"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "Word_userId_status_idx" ON "Word"("userId", "status");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_day_idx" ON "ReviewLog"("userId", "day");

-- CreateIndex
CREATE INDEX "Text_userId_createdAt_idx" ON "Text"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Text_userId_forDay_idx" ON "Text"("userId", "forDay");
