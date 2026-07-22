"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { backupDatabase } from "@/lib/backup";
import { detectWord, type DetectionMatch } from "@/lib/detect";
import { hintForForm, reviewItems, themeOf } from "@/lib/queries";
import {
  caseTriggers,
  explainTrigger,
  triggerCase,
  CASE_ORDER,
  type CaseTrigger,
  type TriggerKind,
} from "@/lib/cases";
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
  TRACK_FAMILIES,
  milestonesFor,
  testSizeForLevel,
  neededCorrect,
  type Track,
  type LevelTrack,
} from "@/lib/levels";
import { getValidatedLevels, recordValidatedLevel } from "@/lib/level-store";
import { findTask, PASS_SCORE, type GradeResult, type ExamItem } from "@/lib/torfl";
import { gradeProduction, generateExamItem, gradeComprehension } from "@/lib/mistral";
import { recordPassedTask } from "@/lib/torfl-store";
import { saveMcqKey, getMcqKey } from "@/lib/exam-items-store";

export async function detectAction(input: string): Promise<DetectionMatch[]> {
  return detectWord(input);
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
    revalidatePath("/");
    revalidatePath(`/word/${input.entryId}`);
  }
  return { correct, expected };
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
  revalidatePath("/");
  if (data.entryId) revalidatePath(`/word/${data.entryId}`);
  return { id: encounter.id };
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

export interface QuizQuestion {
  entryId: number;
  accented: string;
  bare: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
  formKey: string;
  formLabel: string;
  hint: string[]; // grammar rule lines for this form's section
}

/** "discovered" = review forms already seen ; "undiscovered" = forms still to fill in. */
export type QuizMode = "discovered" | "undiscovered";

/** Pick a practice question: a collected, inflecting word and one of its cells.
 * `exclude` ("entryId|formKey") is avoided unless it's the only option (no immediate repeats). */
export async function getQuizQuestionAction(
  mode: QuizMode = "undiscovered",
  exclude?: string,
  theme?: string,
): Promise<QuizQuestion | null> {
  const userId = await currentUserId();
  const encounters = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, matchedFormKey: true },
  });
  if (encounters.length === 0) return null;

  const entryIds = [...new Set(encounters.map((e) => e.entryId!))];
  const discoveredByEntry = new Map<number, Set<string>>();
  for (const e of encounters) {
    if (!e.matchedFormKey) continue;
    const s = discoveredByEntry.get(e.entryId!) ?? new Set();
    s.add(e.matchedFormKey);
    discoveredByEntry.set(e.entryId!, s);
  }

  const allEntries = await prisma.dictionaryEntry.findMany({
    where: { id: { in: entryIds }, type: { not: "other" } },
  });
  if (allEntries.length === 0) return null;

  // Full forms for the collected entries — used for keys, the theme filter and the hint.
  const formVariants = await prisma.dictionaryForm.findMany({
    where: { entryId: { in: allEntries.map((e) => e.id) } },
    orderBy: { variantIndex: "asc" },
    select: { entryId: true, formKey: true, accented: true },
  });
  const formsByEntry = new Map<number, Map<string, string[]>>();
  for (const f of formVariants) {
    const m = formsByEntry.get(f.entryId) ?? new Map<string, string[]>();
    const arr = m.get(f.formKey) ?? [];
    arr.push(f.accented);
    m.set(f.formKey, arr);
    formsByEntry.set(f.entryId, m);
  }

  const entries = theme
    ? allEntries.filter((e) => themeOf(e, formsByEntry.get(e.id) ?? new Map()).key === theme)
    : allEntries;
  if (entries.length === 0) return null;

  // Pool of (entry, formKey) for the requested mode: discovered cells (review) or
  // undiscovered cells (still to fill in).
  const pool: { entry: (typeof entries)[number]; formKey: string }[] = [];
  for (const entry of entries) {
    const keys = [...(formsByEntry.get(entry.id)?.keys() ?? [])];
    const done = discoveredByEntry.get(entry.id) ?? new Set();
    for (const formKey of keys) {
      const isDone = done.has(formKey);
      if (mode === "discovered" ? isDone : !isDone) pool.push({ entry, formKey });
    }
  }
  if (pool.length === 0) return null;
  const choices =
    exclude && pool.length > 1
      ? pool.filter((p) => `${p.entry.id}|${p.formKey}` !== exclude)
      : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  const forms = formsByEntry.get(pick.entry.id) ?? new Map<string, string[]>();

  return {
    entryId: pick.entry.id,
    accented: pick.entry.accented,
    bare: pick.entry.bare,
    type: pick.entry.type as WordType,
    typeLabel: WORD_TYPE_LABELS[pick.entry.type as WordType],
    translationsFr: pick.entry.translationsFr,
    formKey: pick.formKey,
    formLabel: describeFormKey(pick.formKey),
    hint: hintForForm(pick.entry, forms, pick.formKey),
  };
}

export interface QuizResult {
  correct: boolean;
  expected: string[]; // accepted accented forms
}

export async function submitQuizAction(input: {
  entryId: number;
  formKey: string;
  answer: string;
}): Promise<QuizResult> {
  const forms = await prisma.dictionaryForm.findMany({
    where: { entryId: input.entryId, formKey: input.formKey },
  });
  const expected = forms.map((f) => f.accented);
  const accepted = new Set(forms.map((f) => f.bareForm));
  const correct = accepted.has(normalizeBare(input.answer));

  const userId = await currentUserId();
  await prisma.quizAttempt.create({
    data: {
      entryId: input.entryId,
      formKey: input.formKey,
      userAnswer: input.answer,
      correct,
      userId,
    },
  });

  return { correct, expected };
}

// ---- Translation mode (Traduire) -------------------------------------------------

export type TranslateDirection = "ru-fr" | "fr-ru";

export interface TranslateQuestion {
  entryId: number;
  formKey: string | null; // the discovered form (null = dictionary form)
  promptRu: string; // accented Russian form to show (ru-fr) / to produce (fr-ru)
  formLabel: string; // e.g. "prépositionnel pluriel" or "forme du dictionnaire"
  type: WordType;
  typeLabel: string;
  translationsFr: string;
  direction: TranslateDirection;
}

/** Pick a DISCOVERED form (entry + matchedFormKey) that has a French translation. */
export async function getTranslateQuestionAction(
  direction: TranslateDirection,
  type: WordType | "all" = "all",
  exclude?: string,
  theme?: string,
): Promise<TranslateQuestion | null> {
  const userId = await currentUserId();
  const enc = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, matchedFormKey: true },
  });
  if (enc.length === 0) return null;

  const entries = await prisma.dictionaryEntry.findMany({
    where: {
      id: { in: [...new Set(enc.map((e) => e.entryId!))] },
      translationsFr: { not: null },
      ...(type === "all" ? {} : { type }),
    },
  });
  let entryMap = new Map(entries.map((e) => [e.id, e]));

  // Restrict to a grammatical theme if requested (needs the forms to classify).
  if (theme) {
    const fv = await prisma.dictionaryForm.findMany({
      where: { entryId: { in: entries.map((e) => e.id) } },
      orderBy: { variantIndex: "asc" },
      select: { entryId: true, formKey: true, accented: true },
    });
    const fbe = new Map<number, Map<string, string[]>>();
    for (const f of fv) {
      const m = fbe.get(f.entryId) ?? new Map<string, string[]>();
      const arr = m.get(f.formKey) ?? [];
      arr.push(f.accented);
      m.set(f.formKey, arr);
      fbe.set(f.entryId, m);
    }
    entryMap = new Map(
      entries
        .filter((e) => themeOf(e, fbe.get(e.id) ?? new Map()).key === theme)
        .map((e) => [e.id, e]),
    );
  }

  // Distinct discovered (entry, form) pairs whose entry has a French translation.
  const seen = new Set<string>();
  const pairs: { entryId: number; formKey: string | null }[] = [];
  for (const e of enc) {
    if (!entryMap.has(e.entryId!)) continue;
    const key = `${e.entryId}|${e.matchedFormKey ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ entryId: e.entryId!, formKey: e.matchedFormKey });
  }
  if (pairs.length === 0) return null;

  const choices =
    exclude && pairs.length > 1
      ? pairs.filter((p) => `${p.entryId}|${p.formKey ?? ""}` !== exclude)
      : pairs;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  const e = entryMap.get(pick.entryId)!;

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
    translationsFr: e.translationsFr!,
    direction,
  };
}

export interface TranslateResult {
  correct: boolean;
  expected: string[];
}

export async function submitTranslateAction(input: {
  entryId: number;
  formKey: string | null;
  direction: TranslateDirection;
  answer: string;
}): Promise<TranslateResult> {
  const e = await prisma.dictionaryEntry.findUnique({ where: { id: input.entryId } });
  if (!e) return { correct: false, expected: [] };

  let correct = false;
  let expected: string[] = [];
  if (input.direction === "fr-ru") {
    // Answer is Russian: expect the specific discovered form (or the lemma if base).
    if (input.formKey) {
      const forms = await prisma.dictionaryForm.findMany({
        where: { entryId: input.entryId, formKey: input.formKey },
      });
      expected = forms.map((f) => f.accented);
      const accepted = new Set(forms.map((f) => f.bareForm));
      correct = accepted.has(normalizeBare(input.answer));
    } else {
      expected = [e.accented];
      correct = normalizeBare(input.answer) === e.bare;
    }
  } else {
    // Answer is French: accept any of the comma-separated senses.
    const raw = e.translationsFr ?? "";
    expected = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const senses = expected.map(normalizeFr);
    correct = senses.includes(normalizeFr(input.answer));
  }

  const userId = await currentUserId();
  await prisma.quizAttempt.create({
    data: {
      entryId: input.entryId,
      // Encode the direction AND the specific form so catch-up can target the exact item.
      formKey: `translate:${input.direction}:${input.formKey ?? "base"}`,
      userAnswer: input.answer,
      correct,
      userId,
    },
  });
  return { correct, expected };
}

// ---- Rattrapage (catch-up on items last answered wrong) ---------------------------

/** A form-quiz question drawn from the items whose latest attempt was incorrect. */
export async function getReviewQuizQuestionAction(
  exclude?: string,
): Promise<QuizQuestion | null> {
  const userId = await currentUserId();
  const pool = (await reviewItems(userId))
    .filter((it) => it.kind === "forme")
    .map((it) => ({ entryId: it.entryId, formKey: it.attemptKey }));
  if (pool.length === 0) return null;

  const choices =
    exclude && pool.length > 1
      ? pool.filter((p) => `${p.entryId}|${p.formKey}` !== exclude)
      : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];

  const entry = await prisma.dictionaryEntry.findUnique({ where: { id: pick.entryId } });
  if (!entry) return null;

  const formVariants = await prisma.dictionaryForm.findMany({
    where: { entryId: pick.entryId },
    orderBy: { variantIndex: "asc" },
    select: { formKey: true, accented: true },
  });
  const forms = new Map<string, string[]>();
  for (const f of formVariants) {
    const arr = forms.get(f.formKey) ?? [];
    arr.push(f.accented);
    forms.set(f.formKey, arr);
  }

  return {
    entryId: entry.id,
    accented: entry.accented,
    bare: entry.bare,
    type: entry.type as WordType,
    typeLabel: WORD_TYPE_LABELS[entry.type as WordType],
    translationsFr: entry.translationsFr,
    formKey: pick.formKey,
    formLabel: describeFormKey(pick.formKey),
    hint: hintForForm(entry, forms, pick.formKey),
  };
}

/** A translation question (one direction) drawn from the items last answered wrong. */
export async function getReviewTranslateQuestionAction(
  direction: TranslateDirection,
  exclude?: string,
): Promise<TranslateQuestion | null> {
  const userId = await currentUserId();
  const pool = (await reviewItems(userId))
    .filter((it) => it.kind === direction)
    .map((it) => {
      const parts = it.attemptKey.split(":"); // translate : dir : form
      const realKey = parts.length >= 3 && parts[2] !== "base" ? parts[2] : null;
      return { entryId: it.entryId, realKey, cardKey: `${it.entryId}|${realKey ?? ""}` };
    });
  if (pool.length === 0) return null;

  const choices =
    exclude && pool.length > 1 ? pool.filter((p) => p.cardKey !== exclude) : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];

  const e = await prisma.dictionaryEntry.findUnique({ where: { id: pick.entryId } });
  if (!e || !e.translationsFr) return null;

  let promptRu = e.accented;
  let formLabel = "forme du dictionnaire";
  if (pick.realKey) {
    const f = await prisma.dictionaryForm.findFirst({
      where: { entryId: pick.entryId, formKey: pick.realKey },
    });
    if (f) {
      promptRu = f.accented;
      formLabel = describeFormKey(pick.realKey);
    }
  }

  return {
    entryId: e.id,
    formKey: pick.realKey,
    promptRu,
    formLabel,
    type: e.type as WordType,
    typeLabel: WORD_TYPE_LABELS[e.type as WordType],
    translationsFr: e.translationsFr,
    direction,
  };
}

// ---- Parler (pronunciation: speak the word, compared via speech-to-text) ----------

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

  return { correct, expected, heard };
}

// ---- Cas (which case does this trigger govern?) -----------------------------------

export interface CaseExample {
  cas: CaseCode;
  form: string; // the collected word declined in that case (accented)
}
export interface CaseQuestion {
  trigger: string; // the preposition or verb
  triggerKind: TriggerKind;
  word: string | null; // an illustrative collected noun/pronoun (nominative, accented)
  examples: CaseExample[]; // that word in each governed case, for the reveal
  correctCases: CaseCode[]; // any of these is a correct answer
  options: CaseCode[]; // the case buttons to choose from
  explanation: string;
  entryId: number | null; // the collected word used (for recording), null if none
  key: string; // identifier for exclude / review (the trigger)
}

/** Pick a collected noun/pronoun with all its forms (to build per-case examples). */
async function pickCollectedNoun(userId: string): Promise<{
  entryId: number;
  word: string;
  forms: { formKey: string; accented: string }[];
} | null> {
  const enc = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true },
  });
  const ids = [...new Set(enc.map((e) => e.entryId!))];
  if (ids.length === 0) return null;
  const nouns = await prisma.dictionaryEntry.findMany({
    where: { id: { in: ids }, type: { in: ["noun", "pronoun"] } },
  });
  if (nouns.length === 0) return null;
  const e = nouns[Math.floor(Math.random() * nouns.length)];
  const forms = await prisma.dictionaryForm.findMany({
    where: { entryId: e.id },
    orderBy: { variantIndex: "asc" },
    select: { formKey: true, accented: true },
  });
  return { entryId: e.id, word: e.accented, forms };
}

/**
 * A "which case?" question: a single-case trigger (preposition or rection verb) plus a word
 * from the collection. In review mode, draws from triggers last answered wrong.
 */
export async function getCaseQuestionAction(
  caseFilter: CaseCode | null,
  exclude?: string,
  review = false,
): Promise<CaseQuestion | null> {
  const userId = await currentUserId();
  let pool: CaseTrigger[];
  if (review) {
    const triggers = (await reviewItems(userId))
      .filter((it) => it.kind === "case")
      .map((it) => it.attemptKey.slice("case:".length));
    pool = triggers
      .map((t) => triggerCase(t))
      .filter((t): t is CaseTrigger => t !== null);
  } else {
    // Only triggers whose word is in the user's collection.
    const enc = await prisma.encounter.findMany({
      where: { entryId: { not: null }, userId },
      select: { entryId: true },
    });
    const ids = [...new Set(enc.map((e) => e.entryId!))];
    const collectedEntries = ids.length
      ? await prisma.dictionaryEntry.findMany({
          where: { id: { in: ids } },
          select: { bare: true },
        })
      : [];
    const collected = new Set(collectedEntries.map((e) => e.bare));
    pool = caseTriggers().filter((t) => collected.has(t.trigger));
    if (caseFilter) pool = pool.filter((t) => t.cases.includes(caseFilter));
  }
  if (pool.length === 0) return null;

  const choices = exclude && pool.length > 1 ? pool.filter((t) => t.trigger !== exclude) : pool;
  const t = choices[Math.floor(Math.random() * choices.length)];

  const noun = await pickCollectedNoun(userId);
  const examples: CaseExample[] = [];
  if (noun) {
    for (const c of t.cases) {
      const inCase = noun.forms.filter((f) => caseOf(f.formKey) === c);
      const sg = inCase.find((f) => f.formKey.includes("sg")) ?? inCase[0];
      if (sg) examples.push({ cas: c, form: sg.accented });
    }
  }

  return {
    trigger: t.trigger,
    triggerKind: t.kind,
    word: noun?.word ?? null,
    examples,
    correctCases: t.cases,
    options: CASE_ORDER,
    explanation: explainTrigger(t),
    entryId: noun?.entryId ?? null,
    key: t.trigger,
  };
}

export interface CaseResult {
  correct: boolean;
  correctCases: CaseCode[];
  explanation: string;
}

export async function submitCaseAction(input: {
  entryId: number | null;
  trigger: string;
  chosen: CaseCode;
}): Promise<CaseResult> {
  const t = triggerCase(input.trigger);
  const correct = t !== null && t.cases.includes(input.chosen);
  if (input.entryId != null) {
    const userId = await currentUserId();
    await prisma.quizAttempt.create({
      data: {
        entryId: input.entryId,
        formKey: `case:${input.trigger}`,
        userAnswer: input.chosen,
        correct,
        userId,
      },
    });
  }
  return {
    correct,
    correctCases: t?.cases ?? [input.chosen],
    explanation: t ? explainTrigger(t) : "",
  };
}

// ---- Sentence construction check (Phrase) ----------------------------------------

export interface SentenceTok {
  raw: string;
  recognized: boolean;
  cases: CaseCode[];
  pos: string | null; // part of speech label (FR)
}
export interface SentenceCheck {
  tokens: SentenceTok[];
  issues: SentenceIssue[];
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

  return { tokens, issues };
}

// ---- Level control tests (valider un palier de complétion) -----------------------

export interface LevelTestQuestion {
  entryId: number;
  accented: string;
  bare: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
  formKey: string;
  formLabel: string;
  hint: string[];
}

export interface LevelTestInfo {
  track: Track;
  targetLevel: number; // milestone index being attempted
  size: number; // number of questions
  needed: number; // correct answers required to pass
  available: number; // how many discovered forms of this family exist
  insufficient: boolean; // too few discovered forms to run a full control
  questions: LevelTestQuestion[];
}

/** Build a control test for the NEXT unvalidated level of a track. Questions are drawn from
 * the forms the user has actually discovered (filled) in that family. */
export async function getLevelTestAction(track: Track): Promise<LevelTestInfo> {
  const userId = await currentUserId();
  const families = new Set(TRACK_FAMILIES[track]);
  const milestones = milestonesFor(track);
  const validated = (await getValidatedLevels(userId))[track];
  const targetLevel = Math.min(validated + 1, milestones.length - 1);
  const size = testSizeForLevel(targetLevel);
  const needed = neededCorrect(size);

  const encounters = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, matchedFormKey: true, createdAt: true },
  });
  const discoveredByEntry = new Map<number, Set<string>>();
  for (const e of encounters) {
    if (!e.matchedFormKey) continue;
    const s = discoveredByEntry.get(e.entryId!) ?? new Set();
    s.add(e.matchedFormKey);
    discoveredByEntry.set(e.entryId!, s);
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { id: { in: [...discoveredByEntry.keys()] } },
  });
  const familyEntries = entries.filter((e) => families.has(e.type));

  const formVariants = familyEntries.length
    ? await prisma.dictionaryForm.findMany({
        where: { entryId: { in: familyEntries.map((e) => e.id) } },
        orderBy: { variantIndex: "asc" },
        select: { entryId: true, formKey: true, accented: true },
      })
    : [];
  const formsByEntry = new Map<number, Map<string, string[]>>();
  for (const f of formVariants) {
    const m = formsByEntry.get(f.entryId) ?? new Map<string, string[]>();
    const arr = m.get(f.formKey) ?? [];
    arr.push(f.accented);
    m.set(f.formKey, arr);
    formsByEntry.set(f.entryId, m);
  }

  // Pool = discovered cells of the family.
  const pool: { entry: (typeof familyEntries)[number]; formKey: string }[] = [];
  for (const entry of familyEntries) {
    for (const formKey of discoveredByEntry.get(entry.id) ?? new Set<string>()) {
      if (formsByEntry.get(entry.id)?.has(formKey)) pool.push({ entry, formKey });
    }
  }

  const available = pool.length;
  const insufficient = available < size;

  // Uniform random draw across ALL discovered forms of the family (no recency bias, so the
  // control isn't dominated by the last words studied).
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = insufficient ? [] : pool.slice(0, size);

  const questions: LevelTestQuestion[] = picked.map(({ entry, formKey }) => {
    const forms = formsByEntry.get(entry.id) ?? new Map<string, string[]>();
    return {
      entryId: entry.id,
      accented: entry.accented,
      bare: entry.bare,
      type: entry.type as WordType,
      typeLabel: WORD_TYPE_LABELS[entry.type as WordType],
      translationsFr: entry.translationsFr,
      formKey,
      formLabel: describeFormKey(formKey),
      hint: hintForForm(entry, forms, formKey),
    };
  });

  return { track, targetLevel, size, needed, available, insufficient, questions };
}

export interface LevelTestResult {
  passed: boolean;
  validatedLevel: number; // highest validated index after this attempt
}

/** Finalize a control: if the score meets the threshold, validate the target level. */
export async function submitLevelTestAction(input: {
  track: LevelTrack;
  level: number;
  score: number;
  total: number;
}): Promise<LevelTestResult> {
  const userId = await currentUserId();
  const passed = input.total > 0 && input.score >= neededCorrect(input.total);
  let validated = (await getValidatedLevels(userId))[input.track];
  if (passed) {
    const next = await recordValidatedLevel(userId, input.track, input.level);
    validated = next[input.track];
    revalidatePath("/");
  }
  return { passed, validatedLevel: validated };
}

// ---- Vocabulary control (valider un palier de vocabulaire, dans l'ordre d'acquisition) ----

export interface VocabTestQuestion {
  entryId: number;
  accented: string;
  bare: string;
  typeLabel: string;
  translationsFr: string;
}

export interface VocabTestInfo {
  targetLevel: number;
  size: number;
  needed: number;
  available: number;
  insufficient: boolean;
  questions: VocabTestQuestion[]; // ordered oldest → newest (acquisition order)
}

/** Build the vocabulary control for the next unvalidated vocab level. Words are sampled across
 * the collection and presented in the order they were added (oldest first). Translation
 * (ru→fr) is checked via submitTranslateAction. */
export async function getVocabTestAction(): Promise<VocabTestInfo> {
  const userId = await currentUserId();
  const milestones = milestonesFor("vocabulary");
  const validated = (await getValidatedLevels(userId)).vocabulary;
  const targetLevel = Math.min(validated + 1, milestones.length - 1);
  const size = testSizeForLevel(targetLevel);
  const needed = neededCorrect(size);

  const encounters = await prisma.encounter.findMany({
    where: { entryId: { not: null }, userId },
    select: { entryId: true, createdAt: true },
  });
  const firstSeen = new Map<number, number>();
  for (const e of encounters) {
    const t = e.createdAt.getTime();
    const prev = firstSeen.get(e.entryId!);
    if (prev === undefined || t < prev) firstSeen.set(e.entryId!, t);
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { id: { in: [...firstSeen.keys()] }, translationsFr: { not: null } },
  });
  // Acquisition order: oldest first.
  entries.sort((a, b) => (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));

  const available = entries.length;
  const insufficient = available < size;

  // Evenly sample `size` words across the whole history so the control spans early and recent
  // vocabulary, while keeping them in acquisition order.
  let chosen: typeof entries = [];
  if (!insufficient) {
    const step = available / size;
    const idxs = new Set<number>();
    for (let i = 0; i < size; i++) idxs.add(Math.min(available - 1, Math.floor(i * step)));
    // Top up if rounding produced duplicates.
    let k = 0;
    while (idxs.size < size && k < available) {
      idxs.add(k);
      k++;
    }
    chosen = [...idxs].sort((a, b) => a - b).map((i) => entries[i]);
  }

  const questions: VocabTestQuestion[] = chosen.map((e) => ({
    entryId: e.id,
    accented: e.accented,
    bare: e.bare,
    typeLabel: WORD_TYPE_LABELS[e.type as WordType],
    translationsFr: e.translationsFr!,
  }));

  return { targetLevel, size, needed, available, insufficient, questions };
}

// ---- TORFL production grading (Mistral) ------------------------------------------

export interface GradeProductionResult extends GradeResult {
  taskId: string;
  passed: boolean; // recorded as passed (= result.pass)
  error?: string;
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

    if (result.pass) {
      await recordPassedTask(userId, task.id);
      revalidatePath("/validation");
      revalidatePath(`/validation/${task.cefr}`);
    }
    return { ...result, taskId: task.id, passed: result.pass };
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
