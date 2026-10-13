-- Transforme une copie de la base de l'ancienne app (rusky) au schéma Rusky B1.;

-- Uniquement des ajouts : colonnes, tables, index. Rien n'est supprimé.;

ALTER TABLE "_prisma_migrations" RENAME TO "_legacy_prisma_migrations";

ALTER TABLE "DictionaryEntry" ADD COLUMN "b1Rank" INTEGER;

ALTER TABLE "DictionaryEntry" ADD COLUMN "glossFr" TEXT;

ALTER TABLE "DictionaryEntry" ADD COLUMN "exampleRu" TEXT;

ALTER TABLE "DictionaryEntry" ADD COLUMN "exampleFr" TEXT;

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

CREATE TABLE "ReviewLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "entryId" INTEGER NOT NULL,
    "rating" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "day" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE "Settings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "examDate" TEXT,
    "newPerDay" INTEGER NOT NULL DEFAULT 23,
    CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DictionaryEntry_inB1Minimum_b1Rank_idx" ON "DictionaryEntry"("inB1Minimum", "b1Rank");

CREATE INDEX "Word_userId_dueAt_idx" ON "Word"("userId", "dueAt");

CREATE INDEX "Word_userId_status_idx" ON "Word"("userId", "status");

CREATE INDEX "ReviewLog_userId_day_idx" ON "ReviewLog"("userId", "day");

CREATE INDEX "Text_userId_createdAt_idx" ON "Text"("userId", "createdAt");

CREATE INDEX "Text_userId_forDay_idx" ON "Text"("userId", "forDay");

CREATE TABLE "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL, "checksum" TEXT NOT NULL, "finished_at" DATETIME, "migration_name" TEXT NOT NULL,
    "logs" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ('6e807021-9d18-4cb3-97a9-3842b3ab71c9', '701e3580f5be0435d22f926acbd7dfd33ba9b9bad68771a6a567393e5fa5e806', 1791795649223, '20261012090049_init', 1791795649171, 1);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ('fbba71cb-13c8-4f67-a208-8868a45489cf', '54e37d4576794ac9035ee1b5f6a9773f0295617a48d3f0bde13f5ffcc36f8470', 1791799743030, '20261012100000_align_auth_with_legacy', 1791799743010, 1);
