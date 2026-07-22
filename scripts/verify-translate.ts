import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBare, normalizeFr } from "../src/lib/grammar";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  }),
});

async function ruFr(bare: string, answer: string) {
  const e = await prisma.dictionaryEntry.findFirst({ where: { bare } });
  const senses = (e?.translationsFr ?? "").split(",").map((s) => normalizeFr(s));
  console.log(`RU→FR ${bare} "${answer}" => ${senses.includes(normalizeFr(answer))} (attendu: ${e?.translationsFr})`);
}
async function frRu(bare: string, answer: string) {
  const e = await prisma.dictionaryEntry.findFirst({ where: { bare } });
  console.log(`FR→RU ${e?.translationsFr} "${answer}" => ${normalizeBare(answer) === e?.bare} (attendu: ${e?.accented})`);
}

async function main() {
  await ruFr("человек", "personne"); // correct (1er sens)
  await ruFr("человек", "Homme"); // correct (accent/casse ignorés)
  await ruFr("человек", "voiture"); // faux
  await frRu("человек", "человек"); // correct
  await frRu("человек", "человека"); // faux (génitif, pas le nominatif)
}

main().finally(() => prisma.$disconnect());
