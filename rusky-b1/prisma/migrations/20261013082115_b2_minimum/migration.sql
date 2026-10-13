-- Lexique minimum B2 : simple ajout de colonne (pas de reconstruction de table).
ALTER TABLE "DictionaryEntry" ADD COLUMN "inB2Minimum" BOOLEAN NOT NULL DEFAULT false;
