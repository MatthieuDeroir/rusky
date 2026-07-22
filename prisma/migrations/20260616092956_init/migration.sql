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
    "translationsEn" TEXT,
    "translationsDe" TEXT
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
CREATE TABLE "Encounter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER,
    "rawInput" TEXT NOT NULL,
    "matchedFormKey" TEXT,
    "source" TEXT,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Encounter_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "formKey" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizAttempt_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DictionaryEntry_bare_idx" ON "DictionaryEntry"("bare");

-- CreateIndex
CREATE INDEX "DictionaryEntry_type_idx" ON "DictionaryEntry"("type");

-- CreateIndex
CREATE INDEX "DictionaryForm_bareForm_idx" ON "DictionaryForm"("bareForm");

-- CreateIndex
CREATE INDEX "DictionaryForm_entryId_idx" ON "DictionaryForm"("entryId");

-- CreateIndex
CREATE INDEX "Encounter_entryId_idx" ON "Encounter"("entryId");

-- CreateIndex
CREATE INDEX "QuizAttempt_entryId_idx" ON "QuizAttempt"("entryId");

-- CreateIndex
CREATE INDEX "QuizAttempt_entryId_formKey_idx" ON "QuizAttempt"("entryId", "formKey");
