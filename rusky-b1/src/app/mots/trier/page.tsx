import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { accent, LEXICONS, listWhere, shortGloss, type LevelList } from "@/lib/learn";
import { TriageDeck } from "@/components/triage-deck";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trier les mots" };

/** Cartes chargées par visite : la suite arrive en revenant sur la page. */
const BATCH = 300;

export default async function TriagePage({ searchParams }: { searchParams: Promise<{ liste?: string }> }) {
  const userId = await currentUserId();
  const { liste } = await searchParams;
  const lex = LEXICONS.find((l) => l.list === liste);
  if (!lex) notFound();
  // Les mots du lexique jamais rencontrés et pas encore passés au tri, les plus fréquents d'abord.
  const skippedIds = (await prisma.triageSkip.findMany({ where: { userId }, select: { entryId: true } })).map((s) => s.entryId);
  const inList = { AND: [listWhere(lex.list as LevelList), { words: { none: { userId } } }] };
  const where = { AND: [inList, { id: { notIn: skippedIds } }] };
  const [entries, left, skipped] = await Promise.all([
    prisma.dictionaryEntry.findMany({
      where,
      orderBy: [{ b1Rank: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: BATCH,
      select: {
        id: true,
        accented: true,
        type: true,
        gender: true,
        aspect: true,
        glossFr: true,
        translationsFr: true,
        translationsEn: true,
        exampleRu: true,
        exampleFr: true,
      },
    }),
    prisma.dictionaryEntry.count({ where }),
    prisma.dictionaryEntry.count({ where: { AND: [inList, { id: { in: skippedIds } }] } }),
  ]);
  return (
    <TriageDeck
      list={lex.list}
      label={lex.label}
      left={left}
      skipped={skipped}
      cards={entries.map((e) => ({
        id: e.id,
        ru: accent(e.accented),
        type: e.type,
        gender: e.gender,
        aspect: e.aspect,
        gloss: shortGloss(e),
        exampleRu: e.exampleRu,
        exampleFr: e.exampleFr,
      }))}
    />
  );
}
