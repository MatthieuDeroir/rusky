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
    "translationsEn" TEXT,
    "translationsDe" TEXT
);
INSERT INTO "new_DictionaryEntry" ("accented", "animate", "aspect", "bare", "comparative", "gender", "id", "indeclinable", "partner", "plOnly", "sgOnly", "superlative", "translationsDe", "translationsEn", "translationsFr", "type") SELECT "accented", "animate", "aspect", "bare", "comparative", "gender", "id", "indeclinable", "partner", "plOnly", "sgOnly", "superlative", "translationsDe", "translationsEn", "translationsFr", "type" FROM "DictionaryEntry";
DROP TABLE "DictionaryEntry";
ALTER TABLE "new_DictionaryEntry" RENAME TO "DictionaryEntry";
CREATE INDEX "DictionaryEntry_bare_idx" ON "DictionaryEntry"("bare");
CREATE INDEX "DictionaryEntry_type_idx" ON "DictionaryEntry"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
