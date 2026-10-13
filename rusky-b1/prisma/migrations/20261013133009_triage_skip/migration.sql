-- Mots passés au tri rapide : nouvelle table.
CREATE TABLE "TriageSkip" (
    "userId" TEXT NOT NULL,
    "entryId" INTEGER NOT NULL,
    "skippedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "entryId")
);
