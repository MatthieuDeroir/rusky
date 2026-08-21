"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { addXp, setDailyGoal, getGameStats, type XpAward } from "@/lib/xp";
import {
  review as srsReview,
  nextDueDate,
  INITIAL_STATE,
  levelOf,
  levelLabel,
  MAX_LEVEL,
  type SrsState,
} from "@/lib/srs";
import { backupDatabase } from "@/lib/backup";
import { detectWord, type DetectionMatch } from "@/lib/detect";
import { hintForForm, reviewItems, themeOf } from "@/lib/queries";
import {
  analyzeTokens,
  PREPOSITION_CASES,
  type SentenceIssue,
  type Tok,
} from "@/lib/sentence";
import {
  caseOf,
  describeFormKey,
  normalizeBare,
  normalizeFr,
  WORD_TYPE_LABELS,
  type CaseCode,
  type WordType,
} from "@/lib/grammar";
import {
  allScopes,
  findScope,
  entryInScope,
  formKeyInScope,
} from "@/lib/learn";
import { findTask, PASS_SCORE, type GradeResult, type ExamItem } from "@/lib/torfl";
import {
  gradeProduction,
  generateExamItem,
  gradeComprehension,
  checkAnswerTolerance,
  repairFrenchGloss,
  type ToleranceKind,
  type MistakeKind,
} from "@/lib/mistral";
import { translateRuToFr } from "@/lib/deepl";
import { recordPassedTask } from "@/lib/torfl-store";
import { saveMcqKey, getMcqKey } from "@/lib/exam-items-store";

export async function detectAction(input: string): Promise<DetectionMatch[]> {
  return detectWord(input);
}

/** Streak + freezes for the header badge. Fetched client-side (see SiteChrome) so the root
 * layout itself never touches cookies/DB — that's what let a single page navigation re-render
 * the whole layout server-side every time (see TODO.md "Layout racine toujours dynamique"). */
export async function getHeaderStreakAction(): Promise<{ streak: number; freezes: number } | null> {
  try {
    const userId = await currentUserId();
    const stats = await getGameStats(userId);
    return { streak: stats.currentStreak, freezes: stats.streakFreezes };
  } catch {
    return null; // not signed in (e.g. /login)
  }
}

/** Update the user's daily XP goal (profile). Returns the clamped value that was saved. */
export async function setDailyGoalAction(goal: number): Promise<{ goal: number }> {
  const userId = await currentUserId();
  const saved = await setDailyGoal(userId, goal);
  revalidatePath("/");
  revalidatePath("/profil");
  return { goal: saved };
}

export interface DetectedWord {
  raw: string; // the word as it appeared in the sentence
  norm: string; // normalized (accent-stripped, lowercase) key
  matches: DetectionMatch[]; // interpretations (empty = unknown word)
}

/**
 * Detect every (distinct) Cyrillic word in a free sentence — e.g. from voice dictation.
 * Returns one entry per unique word with all its dictionary interpretations.
 */
export async function detectSentenceAction(sentence: string): Promise<DetectedWord[]> {
  const stripPunct = (s: string) => s.replace(/^[^\p{L}-]+|[^\p{L}-]+$/gu, "");
  const rawTokens = sentence
    .split(/\s+/)
    .map(stripPunct)
    .filter((t) => t && /[а-яё]/i.test(t));

  const seen = new Set<string>();
  const uniq: { raw: string; norm: string }[] = [];
  for (const raw of rawTokens) {
    const norm = normalizeBare(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    uniq.push({ raw, norm });
  }

  return Promise.all(
    uniq.map(async ({ raw, norm }) => ({ raw, norm, matches: await detectWord(raw) })),
  );
}

/** Manually set/edit the French translation of an entry (when none is available offline). */
export async function setTranslationAction(entryId: number, fr: string) {
  const value = fr.trim() || null;
  await prisma.dictionaryEntry.update({
    where: { id: entryId },
    data: { translationsFr: value, frManual: value !== null },
  });
  revalidatePath("/");
  revalidatePath(`/word/${entryId}`);
  return { translationsFr: value };
}

export interface FillCellResult {
  correct: boolean;
  expected: string[];
  xp?: XpAward;
}

/**
 * Fill a paradigm cell by typing its form (from the word page). Validated against the
 * reference; on success records an Encounter so the cell becomes "discovered".
 */
export async function fillCellAction(input: {
  entryId: number;
  formKey: string;
  answer: string;
}): Promise<FillCellResult> {
  const forms = await prisma.dictionaryForm.findMany({
    where: { entryId: input.entryId, formKey: input.formKey },
  });
  const expected = forms.map((f) => f.accented);
  const accepted = new Set(forms.map((f) => f.bareForm));
  const correct = accepted.has(normalizeBare(input.answer));

  let xp: XpAward | undefined;
  if (correct) {
    const userId = await currentUserId();
    await prisma.encounter.create({
      data: {
        entryId: input.entryId,
        rawInput: input.answer.trim(),
        matchedFormKey: input.formKey,
        source: "saisie tableau",
        userId,
      },
    });
    scheduleFrenchEnrichment(input.entryId);
    xp = await addXp(userId, "complete");
    revalidatePath("/");
    revalidatePath(`/word/${input.entryId}`);
  }
  return { correct, expected, xp };
}

export interface AddEncounterInput {
  entryId: number | null;
  rawInput: string;
  matchedFormKey: string | null;
  source?: string;
  context?: string;
}

export async function addEncounterAction(data: AddEncounterInput) {
  const userId = await currentUserId();
  const encounter = await prisma.encounter.create({
    data: {
      entryId: data.entryId,
      rawInput: data.rawInput,
      matchedFormKey: data.matchedFormKey,
      source: data.source?.trim() || null,
      context: data.context?.trim() || null,
      userId,
    },
  });
  scheduleFrenchEnrichment(data.entryId);
  const xp = await addXp(userId, "discover");
  revalidatePath("/");
  if (data.entryId) revalidatePath(`/word/${data.entryId}`);
  return { id: encounter.id, xp };
}

/**
 * Remove a word from the collection: deletes its encounters (so it's no longer "collected")
 * and its quiz history. The reference dictionary entry/paradigm is left untouched. Backs up
 * the database first — this is a destructive change to user data.
 */
export async function deleteWordAction(entryId: number): Promise<{ deleted: number }> {
  const userId = await currentUserId();
  await backupDatabase();
  const [, encounters] = await prisma.$transaction([
    prisma.quizAttempt.deleteMany({ where: { entryId, userId } }),
    prisma.encounter.deleteMany({ where: { entryId, userId } }),
  ]);
  revalidatePath("/");
  revalidatePath(`/word/${entryId}`);
  return { deleted: encounters.count };
}

// ---- Parler (pronunciation: speak the word, compared via speech-to-text) ----------
// Mis de côté (retiré de la nav / de la boucle Réviser) mais gardé tel quel pour réexamen futur.

export interface SpeakQuestion {
  entryId: number;
  formKey: string | null; // the discovered form (null = dictionary form)
  promptRu: string; // accented Russian form to pronounce
  formLabel: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
}

/** Pick a collected (entry, form) to pronounce — or, in review mode, one last said wrong. */
export async function getSpeakQuestionAction(
  exclude?: string,
  review = false,
): Promise<SpeakQuestion | null> {
  const userId = await currentUserId();
  let pairs: { entryId: number; formKey: string | null }[];
  if (review) {
    pairs = (await reviewItems(userId))
      .filter((it) => it.kind === "speak")
      .map((it) => {
        const form = it.attemptKey.slice("speak:".length);
        return { entryId: it.entryId, formKey: form === "base" ? null : form };
      });
  } else {
    const enc = await prisma.encounter.findMany({
      where: { entryId: { not: null }, userId },
      select: { entryId: true, matchedFormKey: true },
    });
    const seen = new Set<string>();
    pairs = [];
    for (const e of enc) {
      const key = `${e.entryId}|${e.matchedFormKey ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ entryId: e.entryId!, formKey: e.matchedFormKey });
    }
  }
  if (pairs.length === 0) return null;

  const choices =
    exclude && pairs.length > 1
      ? pairs.filter((p) => `${p.entryId}|${p.formKey ?? ""}` !== exclude)
      : pairs;
  const pick = choices[Math.floor(Math.random() * choices.length)];

  const e = await prisma.dictionaryEntry.findUnique({ where: { id: pick.entryId } });
  if (!e) return null;

  let promptRu = e.accented;
  let formLabel = "forme du dictionnaire";
  if (pick.formKey) {
    const f = await prisma.dictionaryForm.findFirst({
      where: { entryId: pick.entryId, formKey: pick.formKey },
    });
    if (f) {
      promptRu = f.accented;
      formLabel = describeFormKey(pick.formKey);
    }
  }

  return {
    entryId: e.id,
    formKey: pick.formKey,
    promptRu,
    formLabel,
    type: e.type as WordType,
    typeLabel: WORD_TYPE_LABELS[e.type as WordType],
    translationsFr: e.translationsFr,
  };
}

export interface SpeakResult {
  correct: boolean;
  expected: string[]; // accepted accented forms
  heard: string; // what speech-to-text understood (best hypothesis)
  xp?: XpAward;
}

/** Levenshtein distance — used to tolerate a one-letter slip on short words. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/** True when `answer` is close enough to one of `expected` (normalized) to be worth a second
 * opinion from the AI — i.e. plausibly a typo, not a wildly different / unrelated answer. Keeps
 * the tolerance check from firing (and costing a round-trip) on clearly-wrong guesses. */
function plausibleTypo(expected: string[], answer: string): boolean {
  const a = normalizeBare(answer);
  if (!a) return false;
  return expected.some((e) => {
    const b = normalizeBare(e);
    if (!b) return false;
    const dist = editDistance(a, b);
    return dist > 0 && dist <= Math.max(1, Math.ceil(Math.max(a.length, b.length) * 0.3));
  });
}

/** Compare the speech-to-text hypotheses against the requested word (accent-insensitive). */
export async function submitSpeakAction(input: {
  entryId: number;
  formKey: string | null;
  transcripts: string[];
}): Promise<SpeakResult> {
  const entry = await prisma.dictionaryEntry.findUnique({ where: { id: input.entryId } });

  // Accept ANY form of the same word: isolated speech-to-text seldom distinguishes inflected
  // forms (e.g. it returns the lemma "ночь" when you say "ночи"). The goal here is to check
  // pronunciation of the right word, not to disambiguate the exact case.
  const acceptedBare = new Set<string>();
  const allForms = await prisma.dictionaryForm.findMany({
    where: { entryId: input.entryId },
    select: { bareForm: true },
  });
  allForms.forEach((f) => acceptedBare.add(f.bareForm));
  if (entry) acceptedBare.add(entry.bare);

  // Display the specific form that was requested.
  let expected: string[] = [];
  if (input.formKey) {
    const forms = await prisma.dictionaryForm.findMany({
      where: { entryId: input.entryId, formKey: input.formKey },
    });
    expected = forms.map((f) => f.accented);
  } else if (entry) {
    expected = [entry.accented];
  }

  // Gather every hypothesis the recognizer returned, plus each word inside them.
  const strip = (s: string) => s.replace(/^[^\p{L}-]+|[^\p{L}-]+$/gu, "");
  const heardForms = new Set<string>();
  for (const t of input.transcripts) {
    const whole = normalizeBare(t);
    if (whole) heardForms.add(whole);
    for (const w of t.split(/\s+/)) {
      const n = normalizeBare(strip(w));
      if (n) heardForms.add(n);
    }
  }

  const accepted = [...acceptedBare];
  // Exact match on any hypothesis, or a one-letter slip on short words (≤4 chars), where
  // speech-to-text is least reliable.
  const correct = [...heardForms].some(
    (h) =>
      acceptedBare.has(h) ||
      accepted.some(
        (a) =>
          Math.min(a.length, h.length) <= 4 &&
          Math.abs(a.length - h.length) <= 1 &&
          editDistance(a, h) <= 1,
      ),
  );

  const heard = input.transcripts[0]?.trim() ?? "";
  const userId = await currentUserId();
  await prisma.quizAttempt.create({
    data: {
      entryId: input.entryId,
      formKey: `speak:${input.formKey ?? "base"}`,
      userAnswer: heard,
      correct,
      userId,
    },
  });

  const xp = correct ? await addXp(userId, "speak") : undefined;
  return { correct, expected, heard, xp };
}

// ---- Sentence construction check (Phrase) ----------------------------------------
// Mis de côté (retiré de la nav / de la boucle Réviser) mais gardé tel quel pour réexamen futur.

export interface SentenceTok {
  raw: string;
  recognized: boolean;
  cases: CaseCode[];
  pos: string | null; // part of speech label (FR)
}
export interface SentenceCheck {
  tokens: SentenceTok[];
  issues: SentenceIssue[];
  xp?: XpAward;
}

const POS_FR: Record<string, string> = {
  noun: "nom",
  verb: "verbe",
  adjective: "adjectif",
  pronoun: "pronom",
  numeral: "numéral",
  other: "invariable",
};

/** Check a free Russian sentence's case usage offline (no reference answer). */
export async function checkSentenceAction(sentence: string): Promise<SentenceCheck> {
  const rawTokens = sentence.trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return { tokens: [], issues: [] };

  const stripPunct = (s: string) => s.replace(/^[^\p{L}-]+|[^\p{L}-]+$/gu, "");
  const norms = rawTokens.map((r) => normalizeBare(stripPunct(r)));
  const uniq = [...new Set(norms.filter(Boolean))];

  const [formRows, lemmaRows] = await Promise.all([
    uniq.length
      ? prisma.dictionaryForm.findMany({
          where: { bareForm: { in: uniq } },
          select: { bareForm: true, formKey: true, entry: { select: { type: true, bare: true } } },
        })
      : Promise.resolve([]),
    uniq.length
      ? prisma.dictionaryEntry.findMany({
          where: { bare: { in: uniq } },
          select: { bare: true, type: true },
        })
      : Promise.resolve([]),
  ]);

  type Info = { cases: Set<CaseCode>; types: Set<string>; verbLemmas: Set<string> };
  const byNorm = new Map<string, Info>();
  const ensure = (n: string) => {
    let g = byNorm.get(n);
    if (!g) {
      g = { cases: new Set(), types: new Set(), verbLemmas: new Set() };
      byNorm.set(n, g);
    }
    return g;
  };
  for (const r of formRows) {
    const g = ensure(r.bareForm);
    const c = caseOf(r.formKey);
    if (c) g.cases.add(c);
    g.types.add(r.entry.type);
    if (r.entry.type === "verb") g.verbLemmas.add(r.entry.bare);
  }
  for (const r of lemmaRows) {
    const g = ensure(r.bare);
    g.types.add(r.type);
    if (r.type === "verb") g.verbLemmas.add(r.bare);
  }

  const primaryPos = (types: Set<string>): string | null => {
    for (const t of ["verb", "noun", "adjective", "pronoun", "numeral", "other"]) {
      if (types.has(t)) return POS_FR[t];
    }
    return null;
  };

  const toks: Tok[] = rawTokens.map((raw, i) => {
    const norm = norms[i];
    const info = byNorm.get(norm);
    const prepCases = PREPOSITION_CASES[norm] ?? null;
    const types = info?.types ?? new Set<string>();
    return {
      raw,
      norm,
      recognized: !!info || prepCases != null,
      cases: info ? [...info.cases] : [],
      isNominal: ["noun", "adjective", "pronoun", "numeral"].some((t) => types.has(t)),
      isAdjective: types.has("adjective"),
      isNoun: types.has("noun"),
      verbLemmas: info ? [...info.verbLemmas] : [],
      prepCases,
    };
  });

  const issues = analyzeTokens(toks);
  const tokens: SentenceTok[] = toks.map((t) => ({
    raw: t.raw,
    recognized: t.recognized,
    cases: t.cases,
    pos: t.prepCases ? "préposition" : primaryPos(byNorm.get(t.norm)?.types ?? new Set()),
  }));

  // Reward a clean sentence (at least a couple of recognized words, no case issues).
  let xp: XpAward | undefined;
  const recognizedNominals = toks.filter((t) => t.recognized).length;
  if (issues.length === 0 && recognizedNominals >= 2) {
    xp = await addXp(await currentUserId(), "sentence");
  }
  return { tokens, issues, xp };
}

// ---- Réviser : moteur d'entraînement unifié (SRS spaced repetition) --------------
//
// Une seule file, alimentée par FormReview (SM-2) :
//   1. cartes dues (déjà découvertes, à retenir) — recall OU traduction ru→fr
//   2. sinon, une cellule de paradigme pas encore découverte d'un mot déjà collecté
// Une réponse fausse remet la carte à intervalDays=0 (SM-2 "again"), donc elle revient
// immédiatement dans la file : pas besoin d'une page de rattrapage séparée.

export type PracticeKind = "recall" | "translate-ru-fr" | "translate-fr-ru";

export interface PracticeCard {
  kind: PracticeKind;
  entryId: number;
  formKey: string | null; // real DictionaryForm.formKey used for grading (null = lemma)
  reviewKey: string; // FormReview.formKey — formKey for recall, "translate:<dir>:<formKey|base>" else
  accented: string; // the entry's dictionary (lemma) form
  promptRu: string; // Russian form actually shown (recall form, or the ru→fr prompt)
  bare: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
  formLabel: string;
  hint: string[];
  isNew: boolean; // true = undiscovered cell; a correct answer creates an Encounter
}

const TRANSLATE_PREFIX_RU_FR = "translate:ru-fr:";
const TRANSLATE_PREFIX_FR_RU = "translate:fr-ru:";

function parseReviewKey(reviewKey: string): { kind: PracticeKind; realFormKey: string | null } {
  if (reviewKey.startsWith(TRANSLATE_PREFIX_RU_FR)) {
    const rest = reviewKey.slice(TRANSLATE_PREFIX_RU_FR.length);
    return { kind: "translate-ru-fr", realFormKey: rest === "base" ? null : rest };
  }
  if (reviewKey.startsWith(TRANSLATE_PREFIX_FR_RU)) {
    const rest = reviewKey.slice(TRANSLATE_PREFIX_FR_RU.length);
    return { kind: "translate-fr-ru", realFormKey: rest === "base" ? null : rest };
  }
  return { kind: "recall", realFormKey: reviewKey };
}

/**
 * Keep FormReview in sync with the user's discovered forms: seed a "recall" card for every
 * (entry, formKey) discovered via an Encounter, plus one "translate ru→fr" card per distinct
 * collected entry that has a French translation. Idempotent — only inserts what's missing, so
 * it's safe (and needed) to call on every practice load, not just once.
 */
async function ensureReviewSeed(userId: string): Promise<void> {
  const [existing, enc] = await Promise.all([
    prisma.formReview.findMany({ where: { userId }, select: { entryId: true, formKey: true } }),
    prisma.encounter.findMany({
      where: { userId, entryId: { not: null }, matchedFormKey: { not: null } },
      select: { entryId: true, matchedFormKey: true },
    }),
  ]);
  const have = new Set(existing.map((r) => `${r.entryId}|${r.formKey}`));
  const seen = new Set<string>();
  const now = new Date();
  const data: { userId: string; entryId: number; formKey: string; dueAt: Date }[] = [];

  for (const e of enc) {
    const key = `${e.entryId}|${e.matchedFormKey}`;
    if (seen.has(key) || have.has(key)) continue;
    seen.add(key);
    data.push({ userId, entryId: e.entryId!, formKey: e.matchedFormKey!, dueAt: now });
  }

  const entryIds = [...new Set(enc.map((e) => e.entryId!))];
  if (entryIds.length > 0) {
    const translatable = await prisma.dictionaryEntry.findMany({
      where: { id: { in: entryIds }, translationsFr: { not: null } },
      select: { id: true },
    });
    for (const e of translatable) {
      const formKey = `${TRANSLATE_PREFIX_RU_FR}base`;
      const key = `${e.id}|${formKey}`;
      if (seen.has(key) || have.has(key)) continue;
      seen.add(key);
      data.push({ userId, entryId: e.id, formKey, dueAt: now });
    }
  }

  if (data.length > 0) await prisma.formReview.createMany({ data });
}

type EntryRow = Awaited<ReturnType<typeof prisma.dictionaryEntry.findMany>>[number];

/** Encounters + collected entries + their forms, keyed for the pool builders below. */
async function collectedContext(userId: string) {
  const encounters = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, matchedFormKey: true },
  });
  const discoveredByEntry = new Map<number, Set<string>>();
  for (const e of encounters) {
    if (!e.matchedFormKey) continue;
    const s = discoveredByEntry.get(e.entryId!) ?? new Set();
    s.add(e.matchedFormKey);
    discoveredByEntry.set(e.entryId!, s);
  }
  const entryIds = [...new Set(encounters.map((e) => e.entryId!))];
  // formVariants ne dépend que d'entryIds (déjà connu), pas du résultat d'entries — les lancer
  // en série payait un aller-retour Turso pour rien à chaque carte d'exercice chargée.
  const [entries, formVariants] = entryIds.length
    ? await Promise.all([
        prisma.dictionaryEntry.findMany({ where: { id: { in: entryIds } } }),
        prisma.dictionaryForm.findMany({
          where: { entryId: { in: entryIds } },
          orderBy: { variantIndex: "asc" },
          select: { entryId: true, formKey: true, accented: true },
        }),
      ])
    : [[], []];
  const formsByEntry = new Map<number, Map<string, string[]>>();
  for (const f of formVariants) {
    const m = formsByEntry.get(f.entryId) ?? new Map<string, string[]>();
    const arr = m.get(f.formKey) ?? [];
    arr.push(f.accented);
    m.set(f.formKey, arr);
    formsByEntry.set(f.entryId, m);
  }
  return { entries, formsByEntry, discoveredByEntry };
}

async function buildCard(
  entry: EntryRow,
  reviewKey: string,
  forms: Map<string, string[]>,
  isNew: boolean,
): Promise<PracticeCard> {
  const { kind, realFormKey } = parseReviewKey(reviewKey);

  if (kind === "recall") {
    return {
      kind,
      entryId: entry.id,
      formKey: realFormKey,
      reviewKey,
      accented: entry.accented,
      promptRu: entry.accented,
      bare: entry.bare,
      type: entry.type as WordType,
      typeLabel: WORD_TYPE_LABELS[entry.type as WordType],
      translationsFr: entry.translationsFr,
      formLabel: realFormKey ? describeFormKey(realFormKey) : "forme du dictionnaire",
      hint: realFormKey ? hintForForm(entry, forms, realFormKey) : [],
      isNew,
    };
  }

  let promptRu = entry.accented;
  let formLabel = "forme du dictionnaire";
  if (realFormKey) {
    const variants = forms.get(realFormKey);
    if (variants?.[0]) {
      promptRu = variants[0];
      formLabel = describeFormKey(realFormKey);
    }
  }
  return {
    kind,
    entryId: entry.id,
    formKey: realFormKey,
    reviewKey,
    accented: entry.accented,
    promptRu,
    bare: entry.bare,
    type: entry.type as WordType,
    typeLabel: WORD_TYPE_LABELS[entry.type as WordType],
    translationsFr: entry.translationsFr,
    formLabel,
    hint: [],
    isNew: false,
  };
}

/** Pick the next practice card, or "empty" when there's nothing due and nothing left to
 * discover. `theme` filters to a single grammatical theme key (see `themeOf` in queries.ts).
 * `level` filters to words whose base-form (Traduire ru→fr) mastery equals exactly that level —
 * same definition as the Collection, so the two stay correlated. */
export async function getPracticeCardAction(
  exclude?: string,
  theme?: string,
  level?: number,
): Promise<PracticeCard | "empty"> {
  const userId = await currentUserId();
  // ensureReviewSeed (écrit dans FormReview) et collectedContext (lit Encounter/DictionaryEntry/
  // DictionaryForm) ne dépendent pas l'un de l'autre — seule la requête "due" plus bas doit
  // attendre que le seed ait committé. Les lancer en série payait un aller-retour Turso pour
  // rien à CHAQUE carte d'exercice chargée.
  const [, { entries, formsByEntry, discoveredByEntry }] = await Promise.all([
    ensureReviewSeed(userId),
    collectedContext(userId),
  ]);
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  const passesTheme = (entryId: number) => {
    if (!theme) return true;
    const entry = entryMap.get(entryId);
    if (!entry) return false;
    // Coarse filter ("noun" / "verb" / "adjective") = any sub-theme of that type; otherwise a
    // specific fine theme key (e.g. "verb-1"), as returned by themeOf.
    if (theme === "noun" || theme === "verb" || theme === "adjective") return entry.type === theme;
    return themeOf(entry, formsByEntry.get(entryId) ?? new Map()).key === theme;
  };

  let levelByEntry: Map<number, number> | null = null;
  if (level !== undefined) {
    const vocabReviews = await prisma.formReview.findMany({
      where: { userId, entryId: { in: entries.map((e) => e.id) }, formKey: "vocab:ru-fr" },
      select: { entryId: true, repetitions: true },
    });
    levelByEntry = new Map(vocabReviews.map((r) => [r.entryId, Math.min(MAX_LEVEL, r.repetitions)]));
  }
  const passesLevel = (entryId: number) =>
    level === undefined || (levelByEntry!.get(entryId) ?? 0) === level;

  // 1. Due SRS reviews (recall + translate cards already scheduled). "vocab:" rows belong to
  // the standalone Traduire exercise and have their own spacing — never surface them here.
  const dueRaw = await prisma.formReview.findMany({
    where: { userId, dueAt: { lte: new Date() }, NOT: { formKey: { startsWith: "vocab:" } } },
    take: 300,
    select: { entryId: true, formKey: true },
  });
  const due = dueRaw.filter((d) => passesTheme(d.entryId) && passesLevel(d.entryId));
  if (due.length > 0) {
    const choices =
      exclude && due.length > 1
        ? due.filter((d) => `${d.entryId}|${d.formKey}` !== exclude)
        : due;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    const entry = entryMap.get(pick.entryId);
    if (entry) {
      const forms = formsByEntry.get(pick.entryId) ?? new Map<string, string[]>();
      return buildCard(entry, pick.formKey, forms, false);
    }
  }

  // 2. Undiscovered paradigm cells of a collected word.
  const pool: { entryId: number; formKey: string }[] = [];
  for (const entry of entries) {
    if (entry.type === "other") continue;
    if (!passesTheme(entry.id) || !passesLevel(entry.id)) continue;
    const keys = [...(formsByEntry.get(entry.id)?.keys() ?? [])];
    const done = discoveredByEntry.get(entry.id) ?? new Set<string>();
    for (const formKey of keys) {
      if (!done.has(formKey)) pool.push({ entryId: entry.id, formKey });
    }
  }
  if (pool.length === 0) return "empty";
  const choices =
    exclude && pool.length > 1
      ? pool.filter((p) => `${p.entryId}|${p.formKey}` !== exclude)
      : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  const entry = entryMap.get(pick.entryId);
  if (!entry) return "empty";
  const forms = formsByEntry.get(pick.entryId) ?? new Map<string, string[]>();
  return buildCard(entry, pick.formKey, forms, true);
}

/** Pick a card among those whose MOST RECENT attempt was wrong (recall or translate — pas les
 * cartes Traduire, qui ont leur propre forme/écran). "Le plus récent" pour ne pas redonner un
 * mot que tu as depuis retrouvé : une seule bonne réponse plus tard suffit à le sortir du lot.
 * `level` filtre sur le niveau de maîtrise (base ru→fr) du mot, même définition que la Collection. */
export async function getMistakeCardAction(
  exclude?: string,
  level?: number,
): Promise<PracticeCard | "empty"> {
  const userId = await currentUserId();
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      userId,
      OR: [
        { formKey: { startsWith: TRANSLATE_PREFIX_RU_FR } },
        { formKey: { startsWith: TRANSLATE_PREFIX_FR_RU } },
        { formKey: { not: { contains: ":" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { entryId: true, formKey: true, correct: true },
  });
  const latestByKey = new Map<string, { entryId: number; formKey: string; correct: boolean }>();
  for (const a of attempts) {
    const key = `${a.entryId}|${a.formKey}`;
    if (!latestByKey.has(key)) latestByKey.set(key, a);
  }
  let wrong = [...latestByKey.values()].filter((a) => !a.correct);
  if (wrong.length === 0) return "empty";

  if (level !== undefined) {
    const vocabReviews = await prisma.formReview.findMany({
      where: {
        userId,
        entryId: { in: [...new Set(wrong.map((w) => w.entryId))] },
        formKey: "vocab:ru-fr",
      },
      select: { entryId: true, repetitions: true },
    });
    const levelByEntry = new Map(
      vocabReviews.map((r) => [r.entryId, Math.min(MAX_LEVEL, r.repetitions)]),
    );
    wrong = wrong.filter((w) => (levelByEntry.get(w.entryId) ?? 0) === level);
    if (wrong.length === 0) return "empty";
  }

  const { entries, formsByEntry } = await collectedContext(userId);
  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const choices =
    exclude && wrong.length > 1
      ? wrong.filter((a) => `${a.entryId}|${a.formKey}` !== exclude)
      : wrong;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  const entry = entryMap.get(pick.entryId);
  if (!entry) return "empty";
  const forms = formsByEntry.get(pick.entryId) ?? new Map<string, string[]>();
  return buildCard(entry, pick.formKey, forms, false);
}

export interface PracticeResult {
  correct: boolean; // true for an exact answer AND for a tolerated one (typo / near-miss)
  expected: string[]; // accepted answers
  xp?: XpAward;
  discovered: boolean; // true if this answer just added the word/form to the collection
  tolerated: boolean; // accepted despite not matching exactly (IA), i.e. typo
  close: boolean; // "oui mais" : l'idée y est, le terme n'est pas le bon → crédit partiel
  note?: string; // courte explication de l'IA sur un "close" ou un rejet
  mistakeKind?: MistakeKind; // genre du raté ("autre-mot" | "autre-forme" | "oubli"), si faux
  level: number; // niveau de compétence de la carte APRÈS cette réponse
  previousLevel: number; // niveau avant, pour afficher la progression / la rechute
  levelLabel: string;
  // true : le verdict déterministe (faux) est provisoire, l'IA le confirme/corrige en
  // arrière-plan (voir refinePracticeVerdictAction / refineVocabVerdictAction) — le client
  // n'attend pas cette confirmation pour passer à la carte suivante.
  pending?: boolean;
}

/** Ce qu'il faut pour terminer en arrière-plan la vérification IA d'une réponse de Réviser,
 * sans re-lire l'état SRS en base (on part de l'état AVANT cette tentative, capturé au moment
 * du verdict rapide, pour reprogrammer correctement même si l'utilisateur a déjà enchaîné). */
export interface PracticeRefineToken {
  kind: PracticeKind;
  entryId: number;
  formKey: string | null;
  reviewKey: string;
  isNew: boolean;
  answer: string;
  priorState: SrsState;
}

/** Équivalent pour Traduire (vocab). */
export interface VocabRefineToken {
  entryId: number;
  direction: VocabDirection;
  answer: string;
  priorState: SrsState;
}

export interface SubmitPracticeInput {
  kind: PracticeKind;
  entryId: number;
  formKey: string | null; // real DictionaryForm.formKey (null = lemma), for grading
  reviewKey: string; // FormReview.formKey to reschedule
  isNew: boolean;
  answer: string;
}

/** Verdict déterministe (sans IA) pour une carte de Réviser : comparaison exacte contre les
 * formes/traductions connues. Rapide (une seule requête), jamais bloqué sur le réseau. */
async function gradePracticeDeterministic(
  input: SubmitPracticeInput,
): Promise<{ correct: boolean; expected: string[]; aiKind: ToleranceKind; worthAsking: boolean }> {
  let correct: boolean;
  let expected: string[];
  if (input.kind === "recall") {
    const forms = input.formKey
      ? await prisma.dictionaryForm.findMany({
          where: { entryId: input.entryId, formKey: input.formKey },
        })
      : [];
    expected = forms.map((f) => f.accented);
    correct = new Set(forms.map((f) => f.bareForm)).has(normalizeBare(input.answer));
  } else if (input.kind === "translate-ru-fr") {
    const e = await prisma.dictionaryEntry.findUnique({ where: { id: input.entryId } });
    expected = (e?.translationsFr ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    correct = expected.map(normalizeFr).includes(normalizeFr(input.answer));
  } else {
    // translate-fr-ru
    if (input.formKey) {
      const forms = await prisma.dictionaryForm.findMany({
        where: { entryId: input.entryId, formKey: input.formKey },
      });
      expected = forms.map((f) => f.accented);
      correct = new Set(forms.map((f) => f.bareForm)).has(normalizeBare(input.answer));
    } else {
      const e = await prisma.dictionaryEntry.findUnique({ where: { id: input.entryId } });
      expected = e ? [e.accented] : [];
      correct = !!e && normalizeBare(input.answer) === e.bare;
    }
  }
  const aiKind: ToleranceKind = input.kind === "translate-ru-fr" ? "translate" : "recall";
  const worthAsking =
    !correct && input.answer.trim()
      ? aiKind === "translate" || plausibleTypo(expected, input.answer)
      : false;
  return { correct, expected, aiKind, worthAsking };
}

/** Écrit le résultat (SM-2 + historique + XP) d'une carte Réviser ou Traduire — partagé entre
 * le verdict rapide et le raffinement IA en arrière-plan, qui rejoue cette même écriture avec
 * un `correct`/`close` mis à jour une fois la vérification IA terminée. */
async function writeReviewOutcome(
  userId: string,
  entryId: number,
  reviewKey: string,
  answer: string,
  correct: boolean,
  close: boolean,
  priorState: SrsState,
  xpSource: "review" | "discover" | "translate",
  mistakeKind?: MistakeKind,
  note?: string,
): Promise<{ xp?: XpAward; level: number; previousLevel: number; levelLabel: string }> {
  const next = srsReview(priorState, correct ? (close ? "hard" : "good") : "again");
  const now = new Date();
  const dueAt = nextDueDate(next, now);
  await prisma.formReview.upsert({
    where: { userId_entryId_formKey: { userId, entryId, formKey: reviewKey } },
    update: { ...next, dueAt, lastReviewedAt: now },
    create: { userId, entryId, formKey: reviewKey, ...next, dueAt, lastReviewedAt: now },
  });
  await prisma.quizAttempt.create({
    data: { entryId, formKey: reviewKey, userAnswer: answer, correct, userId, mistakeKind, note },
  });
  const xp = correct ? await addXp(userId, xpSource) : undefined;
  return {
    xp,
    level: levelOf(next),
    previousLevel: levelOf(priorState),
    levelLabel: levelLabel(levelOf(next)),
  };
}

/** Grade any practice card (recall or translation) and reschedule it (SM-2). A correct answer
 * on an undiscovered cell also records the Encounter — practicing is now a normal way to grow
 * the collection, not just /add or the word page.
 *
 * Version "expérimentale" découplée : quand la réponse ne correspond à aucune forme/traduction
 * connue mais mérite un second avis IA, on ne bloque PAS la vérification dessus. On écrit tout
 * de suite le verdict déterministe (donc « faux » provisoire) et on renvoie `pending: true` +
 * un `refineToken` : le client empile cette carte, avance immédiatement, et appelle
 * `refinePracticeVerdictAction` en tâche de fond pour obtenir (et appliquer rétroactivement)
 * le verdict IA quand il arrive — sans jamais faire attendre l'utilisateur sur le réseau. */
export async function submitPracticeAction(
  input: SubmitPracticeInput,
): Promise<PracticeResult & { refineToken?: PracticeRefineToken }> {
  const userId = await currentUserId();
  const { correct, expected, worthAsking } = await gradePracticeDeterministic(input);

  const existing = await prisma.formReview.findUnique({
    where: {
      userId_entryId_formKey: { userId, entryId: input.entryId, formKey: input.reviewKey },
    },
  });
  const priorState: SrsState = existing
    ? {
        ease: existing.ease,
        intervalDays: existing.intervalDays,
        repetitions: existing.repetitions,
        lapses: existing.lapses,
      }
    : INITIAL_STATE;

  let discovered = false;
  if (correct && input.isNew && input.formKey) {
    await prisma.encounter.create({
      data: {
        entryId: input.entryId,
        rawInput: input.answer.trim(),
        matchedFormKey: input.formKey,
        source: "réviser",
        userId,
      },
    });
    scheduleFrenchEnrichment(input.entryId);
    discovered = true;
    revalidatePath(`/word/${input.entryId}`);
  }

  const xpSource = input.kind === "recall" ? (discovered ? "discover" : "review") : "translate";
  const outcome = await writeReviewOutcome(
    userId,
    input.entryId,
    input.reviewKey,
    input.answer,
    correct,
    false,
    priorState,
    xpSource,
  );
  if (discovered) revalidatePath("/");

  const pending = !correct && !!input.answer.trim() && worthAsking;
  return {
    correct,
    expected,
    xp: outcome.xp,
    discovered,
    tolerated: false,
    close: false,
    level: outcome.level,
    previousLevel: outcome.previousLevel,
    levelLabel: outcome.levelLabel,
    pending,
    refineToken: pending
      ? {
          kind: input.kind,
          entryId: input.entryId,
          formKey: input.formKey,
          reviewKey: input.reviewKey,
          isNew: input.isNew,
          answer: input.answer,
          priorState,
        }
      : undefined,
  };
}

/** Termine en arrière-plan la vérification qu'un `pending: true` de submitPracticeAction a
 * laissée en suspens : demande le second avis IA, et si le verdict change (typo tolérée ou
 * "oui mais"), corrige rétroactivement la programmation SM-2, l'historique et l'XP déjà écrits
 * (à partir de `priorState`, l'état d'AVANT cette tentative, pas de l'état "faux" déjà en base). */
export async function refinePracticeVerdictAction(
  token: PracticeRefineToken,
): Promise<PracticeResult> {
  const userId = await currentUserId();
  const { expected, aiKind } = await gradePracticeDeterministic({
    kind: token.kind,
    entryId: token.entryId,
    formKey: token.formKey,
    reviewKey: token.reviewKey,
    isNew: token.isNew,
    answer: token.answer,
  });
  const check = await checkAnswerTolerance(aiKind, expected, token.answer);

  if (check.verdict === "wrong") {
    // Le rejet initial était fondé : la programmation SM-2 déjà écrite (verdict "again") reste
    // valable. On annote juste la tentative avec le genre de raté, pour que l'appli s'en
    // souvienne (voir MistakeKind) — au lieu de rejouer l'écriture SM-2/XP pour rien.
    await prisma.quizAttempt
      .create({
        data: {
          entryId: token.entryId,
          formKey: token.reviewKey,
          userAnswer: token.answer,
          correct: false,
          userId,
          mistakeKind: check.mistakeKind,
          note: check.reason,
        },
      })
      .catch(() => {});
    const already = srsReview(token.priorState, "again");
    return {
      correct: false,
      expected,
      discovered: false,
      tolerated: false,
      close: false,
      note: check.reason,
      mistakeKind: check.mistakeKind,
      level: levelOf(already),
      previousLevel: levelOf(token.priorState),
      levelLabel: levelLabel(levelOf(already)),
      pending: false,
    };
  }

  const tolerated = check.verdict === "exact";
  const close = check.verdict === "close";

  // Un "à peu près" ne fait pas découvrir une case : la forme exacte n'a pas été produite.
  let discovered = false;
  if (!close && token.isNew && token.formKey) {
    await prisma.encounter.create({
      data: {
        entryId: token.entryId,
        rawInput: token.answer.trim(),
        matchedFormKey: token.formKey,
        source: "réviser",
        userId,
      },
    });
    scheduleFrenchEnrichment(token.entryId);
    discovered = true;
    revalidatePath(`/word/${token.entryId}`);
  }

  const xpSource = token.kind === "recall" ? (discovered ? "discover" : "review") : "translate";
  const outcome = await writeReviewOutcome(
    userId,
    token.entryId,
    token.reviewKey,
    token.answer,
    true,
    close,
    token.priorState,
    xpSource,
  );
  if (discovered) revalidatePath("/");

  return {
    correct: true,
    expected,
    xp: outcome.xp,
    discovered,
    tolerated,
    close,
    note: check.reason,
    level: outcome.level,
    previousLevel: outcome.previousLevel,
    levelLabel: outcome.levelLabel,
    pending: false,
  };
}

// ---- Apprendre : essai-erreur par classe, et matraquage des irréguliers ----------
//
// Distinct de Réviser : on travaille UNE classe à la fois (1re déclinaison singulier, verbes
// 2e conjugaison pluriel…).
//   • mode "discover" (formes régulières) : deviner AVANT d'avoir la règle, révéler la règle
//     en contraste avec la tentative, puis retenter aussitôt — c'est le retry (via
//     submitPracticeAction) qui compte : XP, découverte, planification SRS.
//   • mode "rote" (irréguliers) : rien à déduire, on matraque jusqu'à ce que ça rentre.

export interface ScopeAvailability {
  key: string;
  words: number; // collected words of this scope
  remaining: number; // cells of the scope still undiscovered
  total: number; // cells of the scope in total
}

/** How much material the user's collection offers for each learn scope. */
export async function getLearnScopesAction(): Promise<ScopeAvailability[]> {
  const userId = await currentUserId();
  const { entries, formsByEntry, discoveredByEntry } = await collectedContext(userId);

  return allScopes().map((scope) => {
    let words = 0;
    let remaining = 0;
    let total = 0;
    for (const entry of entries) {
      const forms = formsByEntry.get(entry.id) ?? new Map<string, string[]>();
      if (!entryInScope(scope, entry, forms)) continue;
      const keys = [...forms.keys()].filter((k) => formKeyInScope(scope, k));
      if (keys.length === 0) continue;
      words += 1;
      total += keys.length;
      const done = discoveredByEntry.get(entry.id) ?? new Set<string>();
      remaining += keys.filter((k) => !done.has(k)).length;
    }
    return { key: scope.key, words, remaining, total };
  });
}

export interface FailureDrillCard {
  entryId: number;
  formKey: string;
  accented: string; // lemma
  bare: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
  formLabel: string;
  alreadyKnown: boolean; // true = cell already discovered (rote mode, or scope exhausted)
}

/** Pick a cell of `scopeKey` to answer. In "discover" mode it prefers cells not yet
 * discovered (guess blind, rule after); in "rote" mode — and once a discover scope is
 * exhausted — it draws from every cell of the scope, since irregulars are drilled by
 * repetition, not deduction. */
export async function getLearnCardAction(
  scopeKey: string,
  exclude?: string,
): Promise<FailureDrillCard | "empty"> {
  const scope = findScope(scopeKey);
  if (!scope) return "empty";
  const userId = await currentUserId();
  const { entries, formsByEntry, discoveredByEntry } = await collectedContext(userId);

  const fresh: { entryId: number; formKey: string }[] = [];
  const known: { entryId: number; formKey: string }[] = [];
  for (const entry of entries) {
    const forms = formsByEntry.get(entry.id) ?? new Map<string, string[]>();
    if (!entryInScope(scope, entry, forms)) continue;
    const done = discoveredByEntry.get(entry.id) ?? new Set<string>();
    for (const formKey of forms.keys()) {
      if (!formKeyInScope(scope, formKey)) continue;
      (done.has(formKey) ? known : fresh).push({ entryId: entry.id, formKey });
    }
  }

  // Rote always drills the whole class; discover works through the unseen cells first.
  const pool = scope.mode === "rote" ? [...fresh, ...known] : fresh.length > 0 ? fresh : known;
  if (pool.length === 0) return "empty";

  const choices =
    exclude && pool.length > 1
      ? pool.filter((p) => `${p.entryId}|${p.formKey}` !== exclude)
      : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  const entry = entries.find((e) => e.id === pick.entryId)!;
  const alreadyKnown = (discoveredByEntry.get(pick.entryId) ?? new Set<string>()).has(pick.formKey);

  return {
    entryId: entry.id,
    formKey: pick.formKey,
    accented: entry.accented,
    bare: entry.bare,
    type: entry.type as WordType,
    typeLabel: WORD_TYPE_LABELS[entry.type as WordType],
    translationsFr: entry.translationsFr,
    formLabel: describeFormKey(pick.formKey),
    alreadyKnown,
  };
}

export interface FailureDrillReveal {
  expected: string[]; // the correct accented form(s)
  hint: string[]; // the grammar rule for this cell's section
  guessWasCorrect: boolean; // whether the blind guess happened to already be right
}

/** Reveal the correct form + rule for a blind guess, and log the guess (namespaced "predict:" —
 * never touches FormReview scheduling; only the retry, via submitPracticeAction, does). */
export async function revealFailureDrillAction(input: {
  entryId: number;
  formKey: string;
  guess: string;
}): Promise<FailureDrillReveal> {
  const entry = await prisma.dictionaryEntry.findUnique({ where: { id: input.entryId } });
  const allForms = entry
    ? await prisma.dictionaryForm.findMany({
        where: { entryId: input.entryId },
        orderBy: { variantIndex: "asc" },
        select: { formKey: true, accented: true, bareForm: true },
      })
    : [];
  const formsByKey = new Map<string, string[]>();
  for (const f of allForms) {
    const arr = formsByKey.get(f.formKey) ?? [];
    arr.push(f.accented);
    formsByKey.set(f.formKey, arr);
  }
  const cell = allForms.filter((f) => f.formKey === input.formKey);
  const guessWasCorrect =
    !!input.guess.trim() && new Set(cell.map((f) => f.bareForm)).has(normalizeBare(input.guess));

  const userId = await currentUserId();
  if (entry) {
    await prisma.quizAttempt.create({
      data: {
        entryId: input.entryId,
        formKey: `predict:${input.formKey}`,
        userAnswer: input.guess,
        correct: guessWasCorrect,
        userId,
      },
    });
  }

  return {
    expected: cell.map((f) => f.accented),
    hint: entry ? hintForForm(entry, formsByKey, input.formKey) : [],
    guessWasCorrect,
  };
}

// ---- Traductions FR : remplissage et correction progressifs par l'IA ---------------
//
// La source WikDict est lacunaire (~49 % de couverture) et parfois franchement fausse
// (добро → « foutre » au lieu de « bien »). Le gloss ANGLAIS d'OpenRussian, lui, est fiable :
// on s'en sert comme référence pour compléter/corriger le français, au fil des questions,
// une seule fois par entrée (`frChecked`). Les traductions saisies à la main (`frManual`)
// ne sont jamais touchées.

type EntryLike = {
  id: number;
  bare: string;
  accented: string;
  type: string;
  translationsFr: string | null;
  translationsEn: string | null;
  frManual: boolean;
  frChecked: boolean;
  deeplChecked: boolean;
};

/** Longueur au-delà de laquelle un résultat DeepL sent pour une seule glose de dictionnaire est
 * suspect (DeepL a traduit une phrase entière, pas juste le mot) — on l'ignore plutôt que de
 * polluer les réponses acceptées avec du texte hors sujet. */
const DEEPL_GLOSS_MAX_LEN = 40;

/**
 * Ensure an entry's French gloss has been vetted against the English one (Mistral, une fois par
 * entrée) ET enrichi d'une seconde source bon marché (DeepL, une fois par entrée) : plutôt qu'un
 * appel IA à chaque réponse pour juger si une traduction est acceptable, on élargit une bonne
 * fois pour toutes l'ensemble des réponses reconnues comme correctes, en cache. Le grading en
 * direct (submitVocabAction / submitPracticeAction) reste alors une simple comparaison
 * déterministe la plupart du temps. Jamais bloquant : toute panne (réseau, clé absente) laisse
 * la valeur courante inchangée.
 */
async function ensureFrenchGloss(entry: EntryLike): Promise<string | null> {
  let fr = entry.translationsFr;
  const patch: { translationsFr?: string | null; frChecked?: boolean; deeplChecked?: boolean } =
    {};

  if (!entry.frManual && !entry.frChecked) {
    const fix = await repairFrenchGloss({
      accented: entry.accented,
      type: entry.type,
      en: entry.translationsEn,
      fr,
    });
    if (fix.changed) fr = fix.fr ?? fr;
    patch.frChecked = true;
    if (fix.changed) patch.translationsFr = fr;
  }

  if (!entry.frManual && !entry.deeplChecked) {
    const extra = await translateRuToFr(entry.bare);
    patch.deeplChecked = true;
    if (extra && extra.length <= DEEPL_GLOSS_MAX_LEN) {
      const existing = (fr ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const alreadyCovered = existing.some((e) => normalizeFr(e) === normalizeFr(extra));
      if (!alreadyCovered) {
        fr = existing.length > 0 ? `${fr}, ${extra}` : extra;
        patch.translationsFr = fr;
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    await prisma.dictionaryEntry.update({ where: { id: entry.id }, data: patch }).catch(() => {});
    if (patch.translationsFr !== undefined) revalidatePath(`/word/${entry.id}`);
  }
  return fr;
}

/** Appelé depuis chaque endroit qui crée une Encounter (donc découvre potentiellement un mot
 * pour la première fois) : programme la vérification Mistral + DeepL pour APRÈS la réponse déjà
 * envoyée (via `after`), donc sans jamais faire attendre l'utilisateur. Le but : au moment où ce
 * mot apparaît en Traduire, sa traduction française est déjà vérifiée et élargie — plus aucun
 * appel IA nécessaire en direct pendant l'exercice. Un no-op si l'entrée est déjà à jour. */
function scheduleFrenchEnrichment(entryId: number | null) {
  if (entryId === null) return;
  after(async () => {
    const entry = await prisma.dictionaryEntry.findUnique({ where: { id: entryId } });
    if (entry && !entry.frManual && (!entry.frChecked || !entry.deeplChecked)) {
      await ensureFrenchGloss(entry);
    }
  });
}

// ---- Traduire : vocabulaire pur (forme du dictionnaire, sans décliner ni conjuguer) ----

export type VocabDirection = "ru-fr" | "fr-ru";

export interface VocabCard {
  entryId: number;
  accented: string; // lemma, accented
  type: WordType;
  typeLabel: string;
  translationsFr: string;
  direction: VocabDirection;
}

/** A collected word to translate at LEMMA level — never an inflected cell, so this stays pure
 * vocabulary recall. Scheduled in FormReview under "vocab:<dir>" so it has its own spacing,
 * independent of the form-level cards. */
export async function getVocabCardAction(
  direction: VocabDirection,
  exclude?: string,
  level?: number,
  mistakesOnly?: boolean,
): Promise<VocabCard | "empty"> {
  const userId = await currentUserId();
  const enc = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true },
    distinct: ["entryId"],
  });
  const ids = enc.map((e) => e.entryId!);
  if (ids.length === 0) return "empty";

  // An entry with no FR gloss yet is still eligible: the AI fills it in below, from the
  // English one. Only entries with neither FR nor EN are unusable.
  let entries = await prisma.dictionaryEntry.findMany({
    where: {
      id: { in: ids },
      OR: [{ translationsFr: { not: null } }, { translationsEn: { not: null } }],
    },
  });
  if (entries.length === 0) return "empty";

  // "Travailler ses erreurs" côté Traduire : ne garder que les mots dont la DERNIÈRE tentative
  // sur ce sens précis (vocab:<direction>) était fausse — une réussite plus récente les sort du
  // lot, comme pour getMistakeCardAction côté Réviser.
  if (mistakesOnly) {
    const attempts = await prisma.quizAttempt.findMany({
      where: { userId, formKey: `vocab:${direction}`, entryId: { in: entries.map((e) => e.id) } },
      orderBy: { createdAt: "desc" },
      select: { entryId: true, correct: true },
    });
    const latestByEntry = new Map<number, boolean>();
    for (const a of attempts) {
      if (a.entryId != null && !latestByEntry.has(a.entryId)) latestByEntry.set(a.entryId, a.correct);
    }
    entries = entries.filter((e) => latestByEntry.get(e.id) === false);
    if (entries.length === 0) return "empty";
  }

  // Optional mastery filter (coming from Collection) : niveau de la carte Traduire russe →
  // français — même calcul que getCollection.
  if (level !== undefined) {
    const vocabReviews = await prisma.formReview.findMany({
      where: {
        userId,
        entryId: { in: entries.map((e) => e.id) },
        formKey: "vocab:ru-fr",
      },
      select: { entryId: true, repetitions: true },
    });
    const levelByEntry = new Map<number, number>();
    for (const r of vocabReviews) {
      levelByEntry.set(r.entryId, Math.min(MAX_LEVEL, r.repetitions));
    }
    entries = entries.filter((e) => (levelByEntry.get(e.id) ?? 0) === level);
    if (entries.length === 0) return "empty";
  }

  // Prefer words whose vocab card is due (or never seen); fall back to the whole collection.
  const reviewKey = `vocab:${direction}`;
  const rows = await prisma.formReview.findMany({
    where: { userId, formKey: reviewKey, entryId: { in: entries.map((e) => e.id) } },
    select: { entryId: true, dueAt: true },
  });
  const dueAtByEntry = new Map(rows.map((r) => [r.entryId, r.dueAt]));
  const now = new Date();
  const dueOrNew = entries.filter((e) => {
    const d = dueAtByEntry.get(e.id);
    return d === undefined || d <= now;
  });
  const pool = dueOrNew.length > 0 ? dueOrNew : entries;

  const choices =
    exclude && pool.length > 1 ? pool.filter((e) => String(e.id) !== exclude) : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];

  // Vet the French gloss against the English one before showing (or grading) it.
  const fr = await ensureFrenchGloss(pick);
  if (!fr) return "empty";

  return {
    entryId: pick.id,
    accented: pick.accented,
    type: pick.type as WordType,
    typeLabel: WORD_TYPE_LABELS[pick.type as WordType],
    translationsFr: fr,
    direction,
  };
}

type VocabEntry = EntryLike;

/** Verdict déterministe (sans IA) pour une carte de Traduire. */
async function gradeVocabDeterministic(
  entry: VocabEntry,
  direction: VocabDirection,
  answer: string,
): Promise<{ correct: boolean; expected: string[]; aiKind: ToleranceKind; worthAsking: boolean }> {
  let correct: boolean;
  let expected: string[];
  if (direction === "ru-fr") {
    // Same vetted gloss as the one shown on the card (no-op if already checked).
    const fr = await ensureFrenchGloss(entry);
    expected = (fr ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    correct = expected.map(normalizeFr).includes(normalizeFr(answer));
  } else {
    expected = [entry.accented];
    correct = normalizeBare(answer) === entry.bare;
  }
  const aiKind: ToleranceKind = direction === "ru-fr" ? "translate" : "recall";
  const worthAsking = !correct && answer.trim() ? aiKind === "translate" || plausibleTypo(expected, answer) : false;
  return { correct, expected, aiKind, worthAsking };
}

/** Grade a vocabulary card (lemma level) and schedule it under its own "vocab:<dir>" key.
 * Same lenient AI second opinion as Réviser, et le même découplage : quand l'IA doit trancher,
 * on écrit le verdict déterministe tout de suite et on renvoie un `refineToken` pour que le
 * client termine la vérification en tâche de fond (voir refineVocabVerdictAction). */
export async function submitVocabAction(input: {
  entryId: number;
  direction: VocabDirection;
  answer: string;
}): Promise<PracticeResult & { refineToken?: VocabRefineToken }> {
  const userId = await currentUserId();
  const entry = await prisma.dictionaryEntry.findUnique({ where: { id: input.entryId } });
  if (!entry) {
    return {
      correct: false,
      expected: [],
      discovered: false,
      tolerated: false,
      close: false,
      level: 0,
      previousLevel: 0,
      levelLabel: levelLabel(0),
    };
  }

  const { correct, expected, worthAsking } = await gradeVocabDeterministic(
    entry,
    input.direction,
    input.answer,
  );

  const reviewKey = `vocab:${input.direction}`;
  const existing = await prisma.formReview.findUnique({
    where: { userId_entryId_formKey: { userId, entryId: input.entryId, formKey: reviewKey } },
  });
  const priorState: SrsState = existing
    ? {
        ease: existing.ease,
        intervalDays: existing.intervalDays,
        repetitions: existing.repetitions,
        lapses: existing.lapses,
      }
    : INITIAL_STATE;

  const outcome = await writeReviewOutcome(
    userId,
    input.entryId,
    reviewKey,
    input.answer,
    correct,
    false,
    priorState,
    "translate",
  );

  const pending = !correct && !!input.answer.trim() && worthAsking;
  return {
    correct,
    expected,
    xp: outcome.xp,
    discovered: false,
    tolerated: false,
    close: false,
    level: outcome.level,
    previousLevel: outcome.previousLevel,
    levelLabel: outcome.levelLabel,
    pending,
    refineToken: pending
      ? { entryId: input.entryId, direction: input.direction, answer: input.answer, priorState }
      : undefined,
  };
}

/** Pendant de refinePracticeVerdictAction pour Traduire. */
export async function refineVocabVerdictAction(token: VocabRefineToken): Promise<PracticeResult> {
  const userId = await currentUserId();
  const entry = await prisma.dictionaryEntry.findUnique({ where: { id: token.entryId } });
  if (!entry) {
    return {
      correct: false,
      expected: [],
      discovered: false,
      tolerated: false,
      close: false,
      level: 0,
      previousLevel: 0,
      levelLabel: levelLabel(0),
      pending: false,
    };
  }

  const { expected, aiKind } = await gradeVocabDeterministic(entry, token.direction, token.answer);
  const check = await checkAnswerTolerance(aiKind, expected, token.answer);
  const reviewKey = `vocab:${token.direction}`;

  if (check.verdict === "wrong") {
    await prisma.quizAttempt
      .create({
        data: {
          entryId: token.entryId,
          formKey: reviewKey,
          userAnswer: token.answer,
          correct: false,
          userId,
          mistakeKind: check.mistakeKind,
          note: check.reason,
        },
      })
      .catch(() => {});
    const already = srsReview(token.priorState, "again");
    return {
      correct: false,
      expected,
      discovered: false,
      tolerated: false,
      close: false,
      note: check.reason,
      mistakeKind: check.mistakeKind,
      level: levelOf(already),
      previousLevel: levelOf(token.priorState),
      levelLabel: levelLabel(levelOf(already)),
      pending: false,
    };
  }

  const tolerated = check.verdict === "exact";
  const close = check.verdict === "close";
  const outcome = await writeReviewOutcome(
    userId,
    token.entryId,
    reviewKey,
    token.answer,
    true,
    close,
    token.priorState,
    "translate",
  );

  return {
    correct: true,
    expected,
    xp: outcome.xp,
    discovered: false,
    tolerated,
    close,
    note: check.reason,
    level: outcome.level,
    previousLevel: outcome.previousLevel,
    levelLabel: outcome.levelLabel,
    pending: false,
  };
}

// ---- TORFL production grading (Mistral) ------------------------------------------

export interface GradeProductionResult extends GradeResult {
  taskId: string;
  passed: boolean; // recorded as passed (= result.pass)
  error?: string;
  xp?: XpAward;
}

/** Generate the material for a generated épreuve (grammaire QCM / lecture / ecoute). For QCM,
 * the correct answers are stored server-side under a token; only questions/options are returned. */
export async function generateExamItemAction(
  taskId: string,
): Promise<{ item?: ExamItem; error?: string }> {
  const task = findTask(taskId);
  if (!task || !task.generated) return { error: "Épreuve non générable." };
  try {
    const { item, correct } = await generateExamItem(task);
    if (task.skill === "grammaire" && correct) {
      const userId = await currentUserId();
      const token = await saveMcqKey(userId, correct);
      return { item: { ...item, token } };
    }
    return { item };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Génération impossible." };
  }
}

/** Grade any TORFL épreuve; on a pass, record the task. QCM is graded deterministically, the
 * rest by Mistral. */
export async function gradeExamAction(input: {
  taskId: string;
  response?: string; // production
  answers?: string[]; // comprehension answers / QCM chosen indices (as strings)
  item?: ExamItem; // the generated source
}): Promise<GradeProductionResult> {
  const task = findTask(input.taskId);
  if (!task) return blankGrade(input.taskId, "Épreuve inconnue.");
  const userId = await currentUserId();

  try {
    let result: GradeResult;
    if (task.skill === "ecrit" || task.skill === "oral") {
      if (!input.response?.trim()) return blankGrade(task.id, "Réponse vide.");
      result = await gradeProduction(task, input.response.trim());
    } else if (task.skill === "lecture" || task.skill === "ecoute") {
      if (!input.item) return blankGrade(task.id, "Épreuve non chargée.");
      if (!(input.answers ?? []).some((a) => a.trim()))
        return blankGrade(task.id, "Réponses vides.");
      result = await gradeComprehension(task, input.item, input.answers ?? []);
    } else {
      // grammaire (QCM) — deterministic grading against the stored correct answers.
      result = await gradeMcq(userId, input.item, input.answers ?? []);
    }

    let xp: XpAward | undefined;
    if (result.pass) {
      await recordPassedTask(userId, task.id);
      xp = await addXp(userId, "torfl");
      revalidatePath("/validation");
      revalidatePath(`/validation/${task.cefr}`);
    }
    return { ...result, taskId: task.id, passed: result.pass, xp };
  } catch (e) {
    return blankGrade(input.taskId, e instanceof Error ? e.message : "Erreur de correction.");
  }
}

function blankGrade(taskId: string, error: string): GradeProductionResult {
  return { taskId, score: 0, pass: false, passed: false, feedback: "", criteria: [], error };
}

/** Deterministic grading of a QCM (Лексика-Грамматика) against the stored correct answers. */
async function gradeMcq(
  userId: string,
  item: ExamItem | undefined,
  answers: string[],
): Promise<GradeResult> {
  const token = item?.token;
  const correct = token ? await getMcqKey(userId, token) : null;
  if (!item?.mcq || !correct) {
    return { score: 0, pass: false, feedback: "Épreuve non chargée.", criteria: [] };
  }
  const total = correct.length;
  let right = 0;
  const lines: string[] = [];
  for (let i = 0; i < total; i++) {
    const chosen = Number(answers[i]);
    const ok = chosen === correct[i];
    if (ok) right += 1;
    else {
      const good = item.mcq[i]?.options[correct[i]] ?? "?";
      lines.push(`Q${i + 1} : réponse correcte « ${good} »`);
    }
  }
  const score = total > 0 ? Math.round((right / total) * 100) : 0;
  return {
    score,
    pass: score >= PASS_SCORE,
    feedback: `${right}/${total} bonnes réponses.`,
    criteria: [],
    corrected: lines.join("\n") || "Tout est correct 🎉",
  };
}
