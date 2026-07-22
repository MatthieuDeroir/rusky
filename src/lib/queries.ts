import "server-only";
import { prisma } from "./db";
import {
  buildSections,
  getLayout,
  type ParadigmSection,
  type WordType,
} from "./grammar";
import { caseTriggers } from "./cases";
import {
  adjClass,
  analyzeAdjective,
  analyzeNoun,
  analyzeNumeral,
  analyzePronoun,
  analyzeVerb,
  nounClass,
  pluralHeadword,
  verbClass,
  type RuleMap,
} from "./morphology";

type EntryForRules = {
  type: string;
  accented: string;
  gender: string | null;
  indeclinable: boolean | null;
  plOnly: boolean | null;
};

/** Grammar rule lines (by section) for an entry. Shared by the word page and the quiz hint. */
export function rulesForEntry(entry: EntryForRules, forms: Map<string, string[]>): RuleMap {
  switch (entry.type) {
    case "verb":
      return analyzeVerb(entry.accented, forms);
    case "noun":
      return analyzeNoun(entry.gender, forms, entry.indeclinable, entry.plOnly);
    case "adjective":
      return analyzeAdjective(forms);
    case "numeral":
      return analyzeNumeral(forms);
    case "pronoun":
      return analyzePronoun(forms);
    default:
      return {};
  }
}

/** Rule lines for the paradigm section that contains a given formKey (quiz hint). */
export function hintForForm(
  entry: EntryForRules,
  forms: Map<string, string[]>,
  formKey: string,
): string[] {
  const rules = rulesForEntry(entry, forms);
  const layout = getLayout([...forms.keys()]);
  const section = buildSections(layout).find((s) =>
    s.rows.some((r) => r.cells.includes(formKey)),
  );
  return section ? (rules[section.title] ?? []) : [];
}

// ---- Themes (Exercices page) -----------------------------------------------------

/** Grammatical theme (key + French label) for an entry, used to bucket the collection. */
export function themeOf(entry: EntryForRules, forms: Map<string, string[]>): {
  key: string;
  label: string;
} {
  switch (entry.type) {
    case "verb": {
      const c = verbClass(forms);
      if (c === "1") return { key: "verb-1", label: "Verbes — 1re conjugaison" };
      if (c === "2") return { key: "verb-2", label: "Verbes — 2e conjugaison" };
      return { key: "verb-irr", label: "Verbes irréguliers" };
    }
    case "noun": {
      const c = nounClass(entry.gender, forms, entry.indeclinable, entry.plOnly);
      if (c === "1") return { key: "noun-1", label: "Noms — 1re déclinaison (-а/-я)" };
      if (c === "2") return { key: "noun-2", label: "Noms — 2e déclinaison (masc. / -о, -е)" };
      if (c === "3") return { key: "noun-3", label: "Noms — 3e déclinaison (fém. -ь)" };
      return { key: "noun-special", label: "Noms — particuliers" };
    }
    case "adjective": {
      const c = adjClass(forms);
      if (c === "soft") return { key: "adj-soft", label: "Adjectifs — radical mou" };
      if (c === "mixed") return { key: "adj-mixed", label: "Adjectifs — radical mixte" };
      return { key: "adj-hard", label: "Adjectifs — radical dur" };
    }
    case "pronoun":
      return { key: "pronoun", label: "Pronoms" };
    case "numeral":
      return { key: "numeral", label: "Numéraux" };
    default:
      return { key: "other", label: "Invariables" };
  }
}

const THEME_ORDER = [
  "noun-1", "noun-2", "noun-3", "noun-special",
  "verb-1", "verb-2", "verb-irr",
  "adj-hard", "adj-soft", "adj-mixed",
  "pronoun", "numeral", "other",
];

export interface ThemeWord {
  id: number;
  accented: string;
  translationsFr: string | null;
  discovered: number;
  total: number;
}
export interface ExerciseTheme {
  key: string;
  label: string;
  words: ThemeWord[];
}

/** Bucket the user's collected words by grammatical theme. */
export async function getThemes(userId: string): Promise<ExerciseTheme[]> {
  const encounters = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, matchedFormKey: true },
  });
  if (encounters.length === 0) return [];

  const ids = [...new Set(encounters.map((e) => e.entryId!))];
  const discoveredByEntry = new Map<number, Set<string>>();
  for (const e of encounters) {
    if (!e.matchedFormKey) continue;
    const s = discoveredByEntry.get(e.entryId!) ?? new Set();
    s.add(e.matchedFormKey);
    discoveredByEntry.set(e.entryId!, s);
  }

  const [entries, formRows] = await Promise.all([
    prisma.dictionaryEntry.findMany({ where: { id: { in: ids } } }),
    prisma.dictionaryForm.findMany({
      where: { entryId: { in: ids } },
      select: { entryId: true, formKey: true, accented: true, variantIndex: true },
      orderBy: { variantIndex: "asc" },
    }),
  ]);

  const formsByEntry = new Map<number, Map<string, string[]>>();
  const totalByEntry = new Map<number, Set<string>>();
  for (const f of formRows) {
    const m = formsByEntry.get(f.entryId) ?? new Map<string, string[]>();
    const arr = m.get(f.formKey) ?? [];
    arr.push(f.accented);
    m.set(f.formKey, arr);
    formsByEntry.set(f.entryId, m);
    const t = totalByEntry.get(f.entryId) ?? new Set<string>();
    t.add(f.formKey);
    totalByEntry.set(f.entryId, t);
  }

  const groups = new Map<string, ExerciseTheme>();
  for (const entry of entries) {
    const forms = formsByEntry.get(entry.id) ?? new Map();
    const theme = themeOf(entry, forms);
    const group = groups.get(theme.key) ?? { key: theme.key, label: theme.label, words: [] };
    group.words.push({
      id: entry.id,
      accented: entry.accented,
      translationsFr: entry.translationsFr,
      discovered: discoveredByEntry.get(entry.id)?.size ?? 0,
      total: totalByEntry.get(entry.id)?.size ?? 0,
    });
    groups.set(theme.key, group);
  }

  // Within a theme: words still to complete first (alpha), then completed ones (alpha) — so the
  // user sees at a glance what's left to fill.
  const isComplete = (w: { discovered: number; total: number }) =>
    w.total > 0 && w.discovered >= w.total;
  for (const g of groups.values())
    g.words.sort((a, b) => {
      const ca = isComplete(a);
      const cb = isComplete(b);
      if (ca !== cb) return ca ? 1 : -1;
      return a.accented.localeCompare(b.accented, "ru");
    });
  return [...groups.values()].sort(
    (a, b) => THEME_ORDER.indexOf(a.key) - THEME_ORDER.indexOf(b.key),
  );
}

/** Previous/next word ids. Within a theme, navigation targets the words still TO COMPLETE
 * (alphabetical, wrapping around) so finishing one jumps to the next to fill — never to an
 * already-completed word. Without a theme, it's plain sequential over the collection. */
export async function getWordNeighbors(
  id: number,
  userId: string,
  theme?: string,
): Promise<{ prevId: number | null; nextId: number | null }> {
  if (theme) {
    const t = (await getThemes(userId)).find((x) => x.key === theme);
    const words = (t ? [...t.words] : []).sort((a, b) =>
      a.accented.localeCompare(b.accented, "ru"),
    );
    const idx = words.findIndex((w) => w.id === id);
    if (idx < 0) return { prevId: null, nextId: null };
    const incomplete = (w: { discovered: number; total: number }) =>
      w.total > 0 && w.discovered < w.total;
    let nextId: number | null = null;
    for (let i = 1; i < words.length && nextId === null; i++) {
      const w = words[(idx + i) % words.length];
      if (w.id !== id && incomplete(w)) nextId = w.id;
    }
    let prevId: number | null = null;
    for (let i = 1; i < words.length && prevId === null; i++) {
      const w = words[(idx - i + words.length) % words.length];
      if (w.id !== id && incomplete(w)) prevId = w.id;
    }
    return { prevId, nextId };
  }
  const ids = (await getCollection(userId)).map((i) => i.id);
  const idx = ids.indexOf(id);
  if (idx < 0) return { prevId: null, nextId: null };
  return {
    prevId: idx > 0 ? ids[idx - 1] : null,
    nextId: idx < ids.length - 1 ? ids[idx + 1] : null,
  };
}

export interface CollectionItem {
  id: number;
  bare: string;
  accented: string;
  type: WordType;
  translationsFr: string | null;
  gender: string | null;
  aspect: string | null;
  discovered: number;
  total: number;
  firstSeen: number; // epoch ms of the earliest encounter (date added)
}

/** All words the user has encountered, with discovery progress. */
export async function getCollection(userId: string): Promise<CollectionItem[]> {
  const encounters = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, matchedFormKey: true, createdAt: true },
  });
  if (encounters.length === 0) return [];

  const entryIds = [...new Set(encounters.map((e) => e.entryId!))];
  const discoveredByEntry = new Map<number, Set<string>>();
  const firstSeenByEntry = new Map<number, number>();
  for (const e of encounters) {
    const t = e.createdAt.getTime();
    const prev = firstSeenByEntry.get(e.entryId!);
    if (prev === undefined || t < prev) firstSeenByEntry.set(e.entryId!, t);
    if (!e.matchedFormKey) continue;
    const set = discoveredByEntry.get(e.entryId!) ?? new Set();
    set.add(e.matchedFormKey);
    discoveredByEntry.set(e.entryId!, set);
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { id: { in: entryIds } },
  });
  const formKeyRows = await prisma.dictionaryForm.findMany({
    where: { entryId: { in: entryIds } },
    select: { entryId: true, formKey: true },
    distinct: ["entryId", "formKey"],
  });
  const totalByEntry = new Map<number, number>();
  for (const r of formKeyRows) {
    totalByEntry.set(r.entryId, (totalByEntry.get(r.entryId) ?? 0) + 1);
  }

  return entries
    .map((e) => ({
      id: e.id,
      bare: e.bare,
      accented: e.accented,
      type: e.type as WordType,
      translationsFr: e.translationsFr,
      gender: e.gender,
      aspect: e.aspect,
      discovered: discoveredByEntry.get(e.id)?.size ?? 0,
      total: totalByEntry.get(e.id) ?? 0,
      firstSeen: firstSeenByEntry.get(e.id) ?? 0,
    }))
    .sort((a, b) => a.bare.localeCompare(b.bare, "ru"));
}

export interface ParadigmCellData {
  formKey: string;
  label: string;
  variants: string[]; // accented forms (may be empty if reference has none)
  discovered: boolean;
}
export interface RenderedSection {
  title: string;
  columns: string[];
  rows: { label: string; cells: (ParadigmCellData | null)[] }[];
  rule: string[]; // rule lines that belong to this section (may be empty)
}
/**
 * The "presfut" forms are tense-ambiguous in the dataset, but Russian tense depends on aspect:
 *   • imperfective → these are the PRESENT; the future is compound (быть + infinitive).
 *   • perfective   → there is no present; these conjugated forms ARE the (simple) future.
 * Relabel the section and prepend the matching explanation accordingly.
 */
function conjugationLabel(
  title: string,
  aspect: string | null,
  accented: string,
  rule: string[],
): { title: string; rule: string[] } {
  if (title !== "Présent / Futur") return { title, rule };
  if (aspect === "perfective") {
    return {
      title: "Futur (perfectif)",
      rule: [
        "Verbe perfectif : ces formes conjuguées expriment le FUTUR (action achevée) — il n’y a pas de présent.",
        ...rule,
      ],
    };
  }
  if (aspect === "imperfective") {
    return {
      title: "Présent",
      rule: [
        "Verbe imperfectif : ces formes conjuguées sont le PRÉSENT.",
        `Futur : pas de conjugaison — on emploie бу'ду / бу'дешь / бу'дет / бу'дем / бу'дете / бу'дут + l’infinitif (ex. бу'ду ${accented}).`,
        ...rule,
      ],
    };
  }
  return { title, rule };
}

export interface WordDetail {
  id: number;
  bare: string;
  accented: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
  gender: string | null;
  aspect: string | null;
  comparative: string | null;
  superlative: string | null;
  partner: string | null;
  pluralHeadword: string | null; // nom. plural to show in header when the stem differs
  sections: RenderedSection[];
  discovered: number;
  total: number;
  encounters: {
    id: number;
    rawInput: string;
    matchedFormKey: string | null;
    source: string | null;
    context: string | null;
    createdAt: Date;
  }[];
}

export async function getWordDetail(id: number, userId: string): Promise<WordDetail | null> {
  const entry = await prisma.dictionaryEntry.findUnique({ where: { id } });
  if (!entry) return null;

  const forms = await prisma.dictionaryForm.findMany({
    where: { entryId: id },
    orderBy: { variantIndex: "asc" },
  });
  const variantsByKey = new Map<string, string[]>();
  for (const f of forms) {
    const arr = variantsByKey.get(f.formKey) ?? [];
    arr.push(f.accented);
    variantsByKey.set(f.formKey, arr);
  }

  const encounters = await prisma.encounter.findMany({
    where: { entryId: id, userId },
    orderBy: { createdAt: "desc" },
  });
  const discoveredKeys = new Set(
    encounters.map((e) => e.matchedFormKey).filter((k): k is string => !!k),
  );

  const rules = rulesForEntry(entry, variantsByKey);

  const layout = getLayout([...variantsByKey.keys()]);
  const sections: ParadigmSection[] = buildSections(layout);
  const rendered: RenderedSection[] = sections.map((s) => ({
    ...conjugationLabel(s.title, entry.aspect, entry.accented, rules[s.title] ?? []),
    columns: s.columns,
    rows: s.rows.map((r) => ({
      label: r.label,
      cells: r.cells.map((formKey) => {
        if (!formKey) return null;
        const variants = variantsByKey.get(formKey) ?? [];
        return {
          formKey,
          label: r.label,
          variants,
          discovered: discoveredKeys.has(formKey),
        };
      }),
    })),
  }));

  // Drop sections with no actual forms (e.g. short-forms for a pronoun declined like an adj).
  const visibleSections = rendered.filter((s) =>
    s.rows.some((r) => r.cells.some((c) => c && c.variants.length > 0)),
  );

  const totalKeys = [...variantsByKey.keys()];

  return {
    id: entry.id,
    bare: entry.bare,
    accented: entry.accented,
    type: entry.type as WordType,
    typeLabel: entry.type,
    translationsFr: entry.translationsFr,
    gender: entry.gender,
    aspect: entry.aspect,
    comparative: entry.comparative,
    superlative: entry.superlative,
    partner: entry.partner,
    pluralHeadword: entry.type === "noun" ? pluralHeadword(variantsByKey) : null,
    sections: visibleSections,
    discovered: discoveredKeys.size,
    total: totalKeys.length,
    encounters: encounters.map((e) => ({
      id: e.id,
      rawInput: e.rawInput,
      matchedFormKey: e.matchedFormKey,
      source: e.source,
      context: e.context,
      createdAt: e.createdAt,
    })),
  };
}

// ---- Rattrapage: items whose most recent attempt was wrong ------------------------

/** The kind of exercise an attempt belongs to. */
export type ReviewKind = "forme" | "ru-fr" | "fr-ru" | "speak" | "case";

export interface ReviewItem {
  entryId: number;
  attemptKey: string; // canonical QuizAttempt.formKey
  kind: ReviewKind;
}

// Legacy translate attempts were stored as "translate:ru-fr" (no form); treat as base.
const TR_LEGACY = /^translate:(ru-fr|fr-ru)$/;
const canonAttemptKey = (fk: string) => (TR_LEGACY.test(fk) ? `${fk}:base` : fk);
const kindOf = (fk: string): ReviewKind =>
  fk.startsWith("speak:")
    ? "speak"
    : fk.startsWith("case:")
      ? "case"
      : fk.startsWith("translate:ru-fr")
        ? "ru-fr"
        : fk.startsWith("translate:fr-ru")
          ? "fr-ru"
          : "forme";

/**
 * For each (entry, form) practised, keep only the latest attempt; the ones still wrong are
 * what the user needs to catch up on. Answering correctly later removes the item.
 */
export async function reviewItems(userId: string): Promise<ReviewItem[]> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { entryId: true, formKey: true, correct: true },
  });
  const latest = new Map<string, boolean>();
  for (const a of attempts) {
    latest.set(`${a.entryId}|${canonAttemptKey(a.formKey)}`, a.correct);
  }
  const out: ReviewItem[] = [];
  for (const [key, correct] of latest) {
    if (correct) continue;
    const i = key.indexOf("|");
    const attemptKey = key.slice(i + 1);
    out.push({ entryId: Number(key.slice(0, i)), attemptKey, kind: kindOf(attemptKey) });
  }
  return out;
}

/** Trigger words (prepositions / rection verbs) that are in the user's collection. */
export async function getCollectedCaseTriggers(userId: string): Promise<string[]> {
  const enc = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true },
  });
  const ids = [...new Set(enc.map((e) => e.entryId!))];
  if (ids.length === 0) return [];
  const entries = await prisma.dictionaryEntry.findMany({
    where: { id: { in: ids } },
    select: { bare: true },
  });
  const collected = new Set(entries.map((e) => e.bare));
  return caseTriggers()
    .filter((t) => collected.has(t.trigger))
    .map((t) => t.trigger);
}

export interface CoverageRow {
  type: WordType;
  label: string;
  collected: number; // distinct dictionary entries of this type the user has encountered
  total: number; // entries of this type in the whole dictionary
  pct: number; // 0..100, collected / total
}

const TYPE_PLURAL: Record<string, string> = {
  noun: "Noms",
  verb: "Verbes",
  adjective: "Adjectifs",
  pronoun: "Pronoms",
  numeral: "Numéraux",
  other: "Invariables",
};
const COVERAGE_ORDER = ["noun", "verb", "adjective", "pronoun", "numeral", "other"];

/**
 * Coverage of the whole dictionary, by grammatical type: how many entries of each type the user
 * has collected out of everything that exists in the reference database (incl. not-yet-seen).
 */
export async function getCoverage(userId: string): Promise<CoverageRow[]> {
  const [totals, enc] = await Promise.all([
    prisma.dictionaryEntry.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.encounter.findMany({
      where: { userId, entryId: { not: null } },
      select: { entryId: true },
      distinct: ["entryId"],
    }),
  ]);
  const ids = enc.map((e) => e.entryId!) as number[];
  const collected = ids.length
    ? await prisma.dictionaryEntry.groupBy({
        by: ["type"],
        where: { id: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const totalByType = new Map(totals.map((t) => [t.type, t._count._all]));
  const collByType = new Map(collected.map((c) => [c.type, c._count._all]));

  return COVERAGE_ORDER.filter((t) => (totalByType.get(t) ?? 0) > 0).map((t) => {
    const total = totalByType.get(t) ?? 0;
    const col = collByType.get(t) ?? 0;
    return {
      type: t as WordType,
      label: TYPE_PLURAL[t] ?? t,
      collected: col,
      total,
      pct: total > 0 ? Math.round((col / total) * 1000) / 10 : 0,
    };
  });
}

/** Number of spaced-repetition forms currently due for this user (SRS "Réviser" queue). */
export async function dueReviewCount(userId: string): Promise<number> {
  return prisma.formReview.count({
    where: { userId, dueAt: { lte: new Date() } },
  });
}

/** Count of catch-up items per exercise kind. */
export async function getReviewSummary(userId: string): Promise<Record<ReviewKind, number>> {
  const counts: Record<ReviewKind, number> = {
    forme: 0,
    "ru-fr": 0,
    "fr-ru": 0,
    speak: 0,
    case: 0,
  };
  for (const it of await reviewItems(userId)) counts[it.kind] += 1;
  return counts;
}
