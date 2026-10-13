-- Statistiques de mémorisation : ajouts de colonnes uniquement.
ALTER TABLE "Word" ADD COLUMN "learnedAt" DATETIME;
ALTER TABLE "Word" ADD COLUMN "forgetCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Word" ADD COLUMN "relearnCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Word" ADD COLUMN "lastForgottenAt" DATETIME;
ALTER TABLE "ReviewLog" ADD COLUMN "prevStatus" TEXT;
-- Mots déjà connus : appris à la date où ils sont devenus connus.
UPDATE "Word" SET "learnedAt" = "knownAt" WHERE "status" = 'KNOWN' AND "knownAt" IS NOT NULL;
