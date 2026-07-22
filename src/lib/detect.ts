import { prisma } from "./db";
import {
  describeFormKey,
  normalizeBare,
  WORD_TYPE_LABELS,
  type WordType,
} from "./grammar";

export interface DetectionMatch {
  entryId: number;
  bare: string;
  accented: string;
  type: WordType;
  typeLabel: string;
  /** Which paradigm cell this form fills. null = dictionary/base form. */
  formKey: string | null;
  formLabel: string;
  formAccented: string;
  translationsFr: string | null;
  gender: string | null;
  aspect: string | null;
  /** This exact form/cell has already been added to the collection. */
  alreadyAdded: boolean;
  /** The lemma is already collected (possibly via a different form). */
  lemmaCollected: boolean;
}

function baseLabel(type: WordType): string {
  if (type === "verb") return "Infinitif (forme du dictionnaire)";
  return "Forme du dictionnaire";
}

/**
 * Identify a (possibly inflected) Russian word: returns every interpretation found in the
 * reference dictionary — its lemma, part of speech, and which grammatical form was entered.
 * Ambiguity (e.g. книги = gen.sg / nom.pl / acc.pl) yields multiple matches.
 */
export async function detectWord(input: string): Promise<DetectionMatch[]> {
  const norm = normalizeBare(input);
  if (!norm) return [];

  const [formRows, lemmaRows] = await Promise.all([
    prisma.dictionaryForm.findMany({
      where: { bareForm: norm },
      include: { entry: true },
    }),
    prisma.dictionaryEntry.findMany({ where: { bare: norm } }),
  ]);

  // Which of these lemmas / cells are already in the user's collection?
  const candidateIds = [
    ...new Set([...formRows.map((r) => r.entryId), ...lemmaRows.map((e) => e.id)]),
  ];
  const encounters = candidateIds.length
    ? await prisma.encounter.findMany({
        where: { entryId: { in: candidateIds } },
        select: { entryId: true, matchedFormKey: true },
      })
    : [];
  const collectedLemmas = new Set(encounters.map((e) => e.entryId));
  const discoveredCells = new Set(
    encounters.map((e) => `${e.entryId}|${e.matchedFormKey ?? "base"}`),
  );

  const matches: DetectionMatch[] = [];
  const seen = new Set<string>(); // entryId|formKey
  const entriesWithForm = new Set<number>();

  for (const row of formRows) {
    entriesWithForm.add(row.entryId);
    const key = `${row.entryId}|${row.formKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const e = row.entry;
    matches.push({
      entryId: e.id,
      bare: e.bare,
      accented: e.accented,
      type: e.type as WordType,
      typeLabel: WORD_TYPE_LABELS[e.type as WordType],
      formKey: row.formKey,
      formLabel: describeFormKey(row.formKey),
      formAccented: row.accented,
      translationsFr: e.translationsFr,
      gender: e.gender,
      aspect: e.aspect,
      alreadyAdded: discoveredCells.has(`${e.id}|${row.formKey}`),
      lemmaCollected: collectedLemmas.has(e.id),
    });
  }

  // Base-form (lemma) matches — only when the base form isn't already represented as a
  // stored inflected cell (covers verb infinitives and invariable words).
  for (const e of lemmaRows) {
    if (entriesWithForm.has(e.id)) continue;
    const key = `${e.id}|base`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      entryId: e.id,
      bare: e.bare,
      accented: e.accented,
      type: e.type as WordType,
      typeLabel: WORD_TYPE_LABELS[e.type as WordType],
      formKey: null,
      formLabel: baseLabel(e.type as WordType),
      formAccented: e.accented,
      translationsFr: e.translationsFr,
      gender: e.gender,
      aspect: e.aspect,
      alreadyAdded: discoveredCells.has(`${e.id}|base`),
      lemmaCollected: collectedLemmas.has(e.id),
    });
  }

  // Stable ordering: by lemma, then by formKey.
  matches.sort(
    (a, b) =>
      a.bare.localeCompare(b.bare, "ru") ||
      (a.formKey ?? "").localeCompare(b.formKey ?? ""),
  );
  return matches;
}
