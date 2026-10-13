// Analyse d'un texte pour le Lecteur : découpage → lectures possibles de chaque mot (dictionnaire,
// une seule requête groupée) → choix + rôle + raison par Mistral, paragraphe par paragraphe →
// recoupement déterministe (la lecture doit exister dans le dictionnaire ; la rection des
// prépositions est vérifiée) → JSON mis en cache dans ReadingText.analysis.
// Dégrade sans jamais bloquer : sans IA (clé absente, erreur), le paragraphe est affiché avec la
// lecture la plus probable du dictionnaire, marqué « analyse partielle ».
// Pas de "server-only" ici : le smoke test (scripts/smoke-test-reader.ts) l'importe sous tsx.
import { prisma } from "@/lib/db";
import {
  caseOf,
  describeFormKey,
  displayAccent,
  normalizeBare,
  type CaseCode,
  type WordType,
} from "@/lib/grammar";
import { PREPOSITION_CASES, CASE_FR } from "@/lib/sentence";
import { analyzeReadingChunk, mistralConfigured } from "@/lib/mistral";
import { splitParagraphs, splitSentences, tokenize, type RawToken } from "./segment";
import { isDerivedVerbForm, type VerbForms } from "./participles";
import { READER_SYSTEM_PROMPT, buildReaderUserPrompt, type PromptSentence } from "./prompt";
import {
  ANALYSIS_VERSION,
  CLAUSE_KINDS,
  ROLES,
  STRUCTURE_TAGS,
  type ClauseKind,
  type ReaderAnalysis,
  type ReaderClause,
  type ReaderParagraph,
  type ReaderSentence,
  type ReaderToken,
  type ReaderWord,
  type Role,
  type StructureTag,
} from "./types";

const MAX_SENTENCES_PER_CALL = 5;
const MAX_CANDIDATES = 10;
const CONCURRENCY = 2;

interface Candidate {
  entryId: number;
  lemmaBare: string;
  lemma: string; // accentué, affichable
  type: WordType;
  formKey: string | null;
  formAccented: string | null;
  label: string;
  fr: string | null;
}

type EntryRow = { id: number; bare: string; accented: string; type: string; aspect: string | null; translationsFr: string | null };

const ASPECT_FR: Record<string, string> = { imperfective: "imperfectif", perfective: "perfectif" };

function labelFor(type: WordType, formKey: string | null, aspect: string | null): string {
  const base = formKey ? describeFormKey(formKey) : type === "verb" ? "Infinitif" : "Forme du dictionnaire";
  return type === "verb" && aspect && ASPECT_FR[aspect] ? `${base} (${ASPECT_FR[aspect]})` : base;
}

/** Toutes les lectures possibles de chaque forme normalisée, en deux requêtes pour tout le texte. */
export async function lookupCandidates(norms: string[]): Promise<Map<string, Candidate[]>> {
  const out = new Map<string, Candidate[]>();
  if (norms.length === 0) return out;
  const entrySelect = { id: true, bare: true, accented: true, type: true, aspect: true, translationsFr: true } as const;
  const CHUNK = 400;
  const forms: { formKey: string; accented: string; bareForm: string; entry: EntryRow }[] = [];
  const lemmas: EntryRow[] = [];
  for (let i = 0; i < norms.length; i += CHUNK) {
    const part = norms.slice(i, i + CHUNK);
    const [f, l] = await Promise.all([
      prisma.dictionaryForm.findMany({
        where: { bareForm: { in: part } },
        select: { formKey: true, accented: true, bareForm: true, entry: { select: entrySelect } },
      }),
      prisma.dictionaryEntry.findMany({ where: { bare: { in: part } }, select: entrySelect }),
    ]);
    forms.push(...f);
    lemmas.push(...l);
  }

  const push = (norm: string, c: Candidate) => {
    const list = out.get(norm) ?? [];
    if (list.some((x) => x.entryId === c.entryId && x.formKey === c.formKey)) return;
    list.push(c);
    out.set(norm, list);
  };
  for (const f of forms) {
    const type = f.entry.type as WordType;
    push(f.bareForm, {
      entryId: f.entry.id,
      lemmaBare: f.entry.bare,
      lemma: displayAccent(f.entry.accented),
      type,
      formKey: f.formKey,
      formAccented: displayAccent(f.accented),
      label: labelFor(type, f.formKey, f.entry.aspect),
      fr: f.entry.translationsFr,
    });
  }
  for (const e of lemmas) {
    // Le lemme lui-même : seulement s'il n'est pas déjà couvert par une case de son paradigme
    // (книга = sg_nom suffit) — sinon c'est la seule lecture des invariables (в, и, уже…).
    const covered = (out.get(e.bare) ?? []).some((c) => c.entryId === e.id);
    if (covered) continue;
    const type = e.type as WordType;
    push(e.bare, {
      entryId: e.id,
      lemmaBare: e.bare,
      lemma: displayAccent(e.accented),
      type,
      formKey: null,
      formAccented: displayAccent(e.accented),
      label: labelFor(type, null, e.aspect),
      fr: e.translationsFr,
    });
  }
  for (const [k, list] of out) out.set(k, list.slice(0, MAX_CANDIDATES));
  return out;
}

// ---- Validation de la sortie IA ---------------------------------------------------

type Loose = Record<string, unknown>;
const asObj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/^[a-z]/i, "")) : NaN;
  return Number.isInteger(n) ? n : null;
};

interface SentenceInput {
  raw: RawToken[];
  /** Lectures possibles par mot (ordre des mots de la phrase). */
  cands: Candidate[][];
}

function fallbackWord(raw: string, cands: Candidate[]): ReaderWord {
  const c = cands[0];
  return {
    raw,
    entryId: c?.entryId ?? null,
    lemma: c?.lemma ?? raw,
    type: c?.type ?? null,
    formKey: c?.formKey ?? null,
    formLabel: c?.label ?? "Inconnu du dictionnaire",
    formAccented: c?.formAccented ?? null,
    dictFr: c?.fr ?? null,
    gloss: c?.fr?.split(/[,;]/)[0]?.trim() ?? "",
    role: "other",
    reason: "",
    verified: false,
  };
}

function wordsOf(input: SentenceInput): string[] {
  return input.raw.filter((t) => t.word).map((t) => t.t);
}

function toTokens(raw: RawToken[]): ReaderToken[] {
  let w = 0;
  return raw.map((t) => (t.word ? { t: t.t, w: w++ } : { t: t.t }));
}

/** Un groupe prépositionnel impose son cas : si l'IA a choisi un cas impossible après la
 * préposition alors qu'une autre case du même mot convient, on corrige (книги après без = gén.). */
function enforcePrepositions(input: SentenceInput, words: ReaderWord[]) {
  const raws = wordsOf(input);
  // Ponctuation entre deux mots consécutifs : coupe le groupe.
  const breakBefore: boolean[] = [];
  let wi = -1;
  let sawBreak = false;
  for (const t of input.raw) {
    if (t.word) {
      breakBefore[++wi] = sawBreak;
      sawBreak = false;
    } else if (/[,.;:!?—–()«»"]/.test(t.t)) sawBreak = true;
  }
  for (let j = 0; j < words.length; j++) {
    const chosen = words[j];
    const cs = chosen.formKey ? caseOf(chosen.formKey) : null;
    if (!cs) continue;
    for (let k = j - 1; k >= Math.max(0, j - 4); k--) {
      if (breakBefore[k + 1]) break;
      const prep = normalizeBare(raws[k]);
      const allowed = PREPOSITION_CASES[prep];
      if (allowed) {
        if (!allowed.includes(cs)) {
          const alt = input.cands[j].find(
            (c) => c.entryId === chosen.entryId && c.formKey && allowed.includes(caseOf(c.formKey) as CaseCode),
          );
          if (alt) {
            Object.assign(chosen, {
              formKey: alt.formKey,
              formLabel: alt.label,
              formAccented: alt.formAccented,
              reason: `${CASE_FR[caseOf(alt.formKey!)!]} après « ${raws[k]} »`,
            });
          }
        }
        break;
      }
      // On ne remonte qu'à travers les modificateurs du groupe (adjectifs, possessifs, nombres).
      const t = words[k].type;
      if (t !== "adjective" && t !== "pronoun" && t !== "numeral") break;
    }
  }
}

/** Cas attendus pour un rôle — seuls les rôles qui imposent un cas. */
const ROLE_CASES: Partial<Record<Role, CaseCode[]>> = {
  subject: ["nom"],
  object: ["acc", "gen"],
  indirect: ["dat"],
};

/** Cohérence rôle ↔ cas : l'IA donne souvent le bon rôle mais la mauvaise case d'une forme
 * syncrétique (Хлеб COD lu « nominatif », меня lu comme entrée brute au lieu de я à l'accusatif).
 * Si une autre lecture du MÊME mot porte le cas attendu, on la prend. */
function enforceRoleCases(input: SentenceInput, words: ReaderWord[]) {
  words.forEach((w, j) => {
    const expected = ROLE_CASES[w.role];
    if (!expected || !w.verified) return;
    const cs = w.formKey ? caseOf(w.formKey) : null;
    if (cs && expected.includes(cs)) return;
    const cands = input.cands[j];
    const ok = (c: Candidate) => c.formKey !== null && expected.includes(caseOf(c.formKey) as CaseCode);
    // Priorité : même entrée, puis même lemme, puis n'importe quelle lecture (меня → я).
    const alt =
      cands.find((c) => c.entryId === w.entryId && ok(c)) ??
      cands.find((c) => c.lemmaBare === normalizeBare(w.lemma) && ok(c)) ??
      (w.formKey === null ? cands.find(ok) : undefined);
    if (!alt) return;
    Object.assign(w, {
      entryId: alt.entryId,
      lemma: alt.lemma,
      type: alt.type,
      formKey: alt.formKey,
      formLabel: alt.label,
      formAccented: alt.formAccented,
      dictFr: alt.fr ?? w.dictFr,
    });
  });
}

function buildSentence(input: SentenceInput, model: Loose | undefined): ReaderSentence {
  const raws = wordsOf(input);
  const byW = new Map<number, Loose>();
  for (const w of asArr(model?.words)) {
    const o = asObj(w);
    const i = asInt(o.w);
    if (i !== null && !byW.has(i)) byW.set(i, o);
  }

  const words: ReaderWord[] = raws.map((raw, i) => {
    const cands = input.cands[i];
    const m = byW.get(i);
    if (!m) return fallbackWord(raw, cands);
    const ci = asInt(m.c);
    const role: Role = ROLES.includes(m.role as Role) ? (m.role as Role) : "other";
    const gloss = asStr(m.gloss);
    const reason = asStr(m.reason);
    const c = ci !== null && ci >= 0 && ci < cands.length ? cands[ci] : null;
    if (c) {
      return {
        raw,
        entryId: c.entryId,
        lemma: c.lemma,
        type: c.type,
        formKey: c.formKey,
        formLabel: c.label,
        formAccented: c.formAccented,
        dictFr: c.fr,
        gloss,
        role,
        reason,
        verified: true,
      };
    }
    // Hors dictionnaire (participe, gérondif, comparatif, nom propre…) : on garde l'analyse IA,
    // marquée non vérifiée ; le lemme sera rattaché à une entrée plus tard si elle existe.
    const lemma = asStr(m.lemma) || raw;
    const same = cands.find((x) => x.lemmaBare === normalizeBare(lemma));
    return {
      raw,
      entryId: same?.entryId ?? null,
      lemma: same?.lemma ?? lemma,
      type: same?.type ?? null,
      formKey: null,
      formLabel: asStr(m.form) || same?.label || "Forme hors dictionnaire",
      formAccented: null,
      dictFr: same?.fr ?? null,
      gloss,
      role,
      reason,
      verified: false,
    };
  });

  enforceRoleCases(input, words);
  enforcePrepositions(input, words);

  const clauses: ReaderClause[] = [];
  for (const c of asArr(model?.clauses)) {
    const o = asObj(c);
    const from = asInt(o.from);
    const to = asInt(o.to);
    const kind = o.kind as ClauseKind;
    if (from === null || to === null || from > to || from < 0 || to >= words.length) continue;
    clauses.push({ from, to, kind: CLAUSE_KINDS.includes(kind) ? kind : "other" });
  }
  const structures = asArr(model?.structures).filter((t): t is StructureTag =>
    (STRUCTURE_TAGS as readonly string[]).includes(t as string),
  );

  return {
    tokens: toTokens(input.raw),
    words,
    translation: asStr(model?.translation),
    literal: asStr(model?.literal),
    skeleton: asStr(model?.skeleton),
    clauses,
    structures: [...new Set(structures)],
  };
}

/** Mélange déterministe (la bonne réponse arrive en premier dans la sortie IA). */
function placeAnswer(options: string[], seed: number): { options: string[]; answer: number } {
  const answer = seed % options.length;
  const rest = options.slice(1);
  return { options: [...rest.slice(0, answer), options[0], ...rest.slice(answer)], answer };
}

/** L'IA cite parfois ses repères internes (« (w4) », « dans la phrase 1 ») malgré la consigne. */
function cleanRefs(s: string): string {
  return s
    .replace(/\s*\(w\d+\)/g, "")
    .replace(/\s*\bw\d+\b/g, "")
    .replace(/\s*(dans|de) la (première|deuxième|troisième|quatrième|cinquième|\d+(e|re|ère)?) phrase\b/gi, "")
    .replace(/\s*\(phrase \d+\)/gi, "")
    .replace(/\s+([?.,!])/g, "$1")
    .trim();
}

const CASE_BY_NAME: Record<string, CaseCode> = {
  nominatif: "nom",
  accusatif: "acc",
  génitif: "gen",
  genitif: "gen",
  datif: "dat",
  instrumental: "inst",
  prépositionnel: "prep",
  prepositionnel: "prep",
};
const ASSERTED_CASE_RE =
  /\b(?:est|sont)-(?:il|elle|ils|elles) (?:au|à l'|a l')\s*(nominatif|accusatif|génitif|genitif|datif|instrumental|prépositionnel|prepositionnel)/i;

/** Une question qui AFFIRME un cas (« pourquoi « мне » est-il au datif ? ») peut partir d'une
 * prémisse fausse — typiquement l'accusatif inanimé, identique au nominatif. On ne la garde que si
 * chaque mot cité a bien ce cas dans la lecture retenue (dictionnaire) ; invérifiable = écartée. */
export function questionPremiseOk(q: string, words: ReaderWord[]): boolean {
  const m = ASSERTED_CASE_RE.exec(q);
  if (!m) return true;
  const asserted = CASE_BY_NAME[m[1].toLowerCase()];
  const before = q.slice(0, m.index);
  const quoted = [...before.matchAll(/[«"'“]\s*([\p{L}\u0301-]+)\s*[»"'”]/gu)].map((x) => normalizeBare(x[1]));
  const cited = quoted.filter((w) => /[а-яё]/.test(w));
  if (cited.length === 0) return false;
  return cited.every((c) =>
    words.some((w) => normalizeBare(w.raw) === c && w.verified && w.formKey !== null && caseOf(w.formKey) === asserted),
  );
}

interface RawQuestion {
  /** Index de phrase dans le morceau envoyé à l'IA. */
  after: number;
  q: string;
  options: string[];
  explain: string;
}

function parseQuestions(model: Loose, sentenceCount: number): RawQuestion[] {
  const out: RawQuestion[] = [];
  for (const q of asArr(model.questions)) {
    const o = asObj(q);
    const text = cleanRefs(asStr(o.q));
    const opts = asArr(o.options).map((x) => cleanRefs(asStr(x))).filter(Boolean);
    if (!text || opts.length < 2 || opts.length > 4 || new Set(opts).size !== opts.length) continue;
    const after = Math.min(Math.max(asInt(o.after) ?? sentenceCount - 1, 0), sentenceCount - 1);
    out.push({ after, q: text, options: opts, explain: cleanRefs(asStr(o.explain)) });
  }
  return out;
}

/** Rattache au dictionnaire les lemmes proposés par l'IA pour les mots hors dictionnaire
 * (участвующий → участвовать), pour pouvoir les garder dans la collection. Les participes et
 * gérondifs ainsi rattachés sont ensuite VÉRIFIÉS par dérivation régulière (participles.ts). */
async function linkUnknownLemmas(sentences: ReaderSentence[]) {
  const pending = sentences.flatMap((s) => s.words).filter((w) => w.entryId === null && w.lemma);
  if (pending.length > 0) {
    const bares = [...new Set(pending.map((w) => normalizeBare(w.lemma)))];
    const entries = await prisma.dictionaryEntry.findMany({
      where: { bare: { in: bares } },
      select: { id: true, bare: true, accented: true, type: true, translationsFr: true },
    });
    for (const w of pending) {
      const bare = normalizeBare(w.lemma);
      const matches = entries.filter((e) => e.bare === bare);
      const e = matches.find((x) => (isVerbal(w) ? x.type === "verb" : true)) ?? matches[0];
      if (!e) continue;
      Object.assign(w, {
        entryId: e.id,
        lemma: displayAccent(e.accented),
        type: e.type as WordType,
        dictFr: e.translationsFr,
      });
    }
  }

  const verbal = sentences
    .flatMap((s) => s.words)
    .filter((w) => !w.verified && w.entryId !== null && w.type === "verb" && isVerbal(w));
  if (verbal.length === 0) return;
  const ids = [...new Set(verbal.map((w) => w.entryId!))];
  const [rows, entries] = await Promise.all([
    prisma.dictionaryForm.findMany({
      where: { entryId: { in: ids }, formKey: { in: ["presfut_pl3", "presfut_pl1", "presfut_sg1", "past_m"] }, variantIndex: 0 },
      select: { entryId: true, formKey: true, bareForm: true },
    }),
    prisma.dictionaryEntry.findMany({ where: { id: { in: ids } }, select: { id: true, bare: true } }),
  ]);
  const formsOf = new Map<number, VerbForms>();
  for (const e of entries) formsOf.set(e.id, { infinitive: e.bare });
  for (const r of rows) {
    const f = formsOf.get(r.entryId);
    if (!f) continue;
    if (r.formKey === "presfut_pl3") f.pl3 = r.bareForm;
    if (r.formKey === "presfut_pl1") f.pl1 = r.bareForm;
    if (r.formKey === "presfut_sg1") f.sg1 = r.bareForm;
    if (r.formKey === "past_m") f.pastM = r.bareForm;
  }
  for (const w of verbal) {
    const f = formsOf.get(w.entryId!);
    if (f && isDerivedVerbForm(w.raw, f)) w.verified = true;
  }
}

function isVerbal(w: ReaderWord) {
  return /particip|gérondif|gerondif/i.test(w.formLabel);
}

async function callWithRetry(user: string): Promise<Loose> {
  try {
    return asObj(await analyzeReadingChunk(READER_SYSTEM_PROMPT, user));
  } catch {
    return asObj(await analyzeReadingChunk(READER_SYSTEM_PROMPT, user));
  }
}

/** Analyse un ou plusieurs paragraphes consécutifs en regroupant leurs phrases par morceaux de
 * ≤ 5 (les récits découpés ligne à ligne ne coûtent ainsi pas un appel par ligne). Ne lève jamais :
 * en cas d'échec IA, les phrases gardent l'analyse dictionnaire seule et le paragraphe est marqué
 * failed. */
export async function analyzeParagraphs(
  items: { text: string; idx: number }[],
  cands: Map<string, Candidate[]>,
): Promise<ReaderParagraph[]> {
  const flat: { owner: number; local: number; input: SentenceInput }[] = [];
  items.forEach((item, owner) =>
    splitSentences(item.text).forEach((s, local) => {
      const raw = tokenize(s);
      flat.push({ owner, local, input: { raw, cands: raw.filter((t) => t.word).map((t) => cands.get(normalizeBare(t.t)) ?? []) } });
    }),
  );

  const out: ReaderParagraph[] = items.map((item) => ({ text: item.text, sentences: [], questions: [] }));
  for (let start = 0; start < flat.length; start += MAX_SENTENCES_PER_CALL) {
    const chunk = flat.slice(start, start + MAX_SENTENCES_PER_CALL);
    let model: Loose | null = null;
    if (mistralConfigured()) {
      const prompt: PromptSentence[] = chunk.map(({ input }) => ({
        text: input.raw.map((t) => t.t).join(""),
        words: wordsOf(input).map((raw, i) => ({
          raw,
          candidates: input.cands[i].map((c) => ({ lemma: c.lemma.replace(/\u0301/g, ""), type: c.type, label: c.label })),
        })),
      }));
      try {
        model = await callWithRetry(buildReaderUserPrompt(prompt));
      } catch (e) {
        console.error("[reader] analyse IA échouée", e);
      }
    }
    const bySentence = new Map<number, Loose>();
    for (const sm of asArr(model?.sentences)) {
      const o = asObj(sm);
      const i = asInt(o.s);
      if (i !== null) bySentence.set(i, o);
    }
    chunk.forEach(({ owner, input }, i) => {
      const m = bySentence.get(i) ?? (chunk.length === 1 ? asObj(asArr(model?.sentences)[0]) : undefined);
      out[owner].sentences!.push(buildSentence(input, m));
      if (!model) out[owner].failed = true;
    });
    if (model) {
      const chunkWords = chunk.flatMap(({ owner }) => out[owner].sentences!).flatMap((x) => x.words);
      for (const q of parseQuestions(model, chunk.length).filter((x) => questionPremiseOk(x.q, chunkWords)).slice(0, 1)) {
        const { owner, local } = chunk[q.after];
        const para = out[owner];
        const n = para.questions.length;
        const paraIdx = items[owner].idx;
        para.questions.push({
          id: `p${paraIdx}-${n}`,
          afterSentence: local,
          q: q.q,
          ...placeAnswer(q.options, paraIdx * 7 + n * 3 + q.q.length),
          explain: q.explain,
        });
      }
    }
  }
  await linkUnknownLemmas(out.flatMap((p) => p.sentences ?? []));
  return out;
}

export async function analyzeParagraph(text: string, paraIdx: number, cands: Map<string, Candidate[]>): Promise<ReaderParagraph> {
  return (await analyzeParagraphs([{ text, idx: paraIdx }], cands))[0];
}

export function emptyAnalysis(body: string): ReaderAnalysis {
  return {
    version: ANALYSIS_VERSION,
    paragraphs: splitParagraphs(body).map((text) => ({ text, sentences: null, questions: [] })),
  };
}

/** Part des mots sans aucune lecture dans le dictionnaire (indicateur grossier de difficulté). */
export function difficultyOf(analysis: ReaderAnalysis): number | null {
  const words = analysis.paragraphs.flatMap((p) => p.sentences ?? []).flatMap((s) => s.words);
  if (words.length === 0) return null;
  return words.filter((w) => w.entryId === null).length / words.length;
}

/** Analyse (ou reprend) tout le texte, en sauvegardant après chaque paragraphe pour que le
 * lecteur puisse commencer à lire sans attendre la fin. `onlyFailed` relance les paragraphes
 * analysés sans IA. */
export async function runAnalysis(textId: number, opts: { onlyFailed?: boolean } = {}): Promise<void> {
  const text = await prisma.readingText.findUnique({ where: { id: textId } });
  if (!text) return;
  let analysis: ReaderAnalysis =
    text.analysis && text.analysisVersion === ANALYSIS_VERSION ? JSON.parse(text.analysis) : emptyAnalysis(text.body);
  if (opts.onlyFailed) {
    analysis.paragraphs = analysis.paragraphs.map((p) => (p.failed ? { text: p.text, sentences: null, questions: [] } : p));
  }
  const save = (data: Partial<{ status: string; error: string | null; difficulty: number | null }> = {}) =>
    prisma.readingText.update({
      where: { id: textId },
      data: { analysis: JSON.stringify(analysis), analysisVersion: ANALYSIS_VERSION, ...data },
    });

  try {
    await save({ status: "ANALYZING", error: null });
    const norms = [
      ...new Set(
        analysis.paragraphs
          .flatMap((p) => tokenize(p.text))
          .filter((t) => t.word)
          .map((t) => normalizeBare(t.t)),
      ),
    ];
    const cands = await lookupCandidates(norms);

    // Lots de paragraphes consécutifs à analyser, ≤ 5 phrases par lot quand c'est possible.
    const batches: number[][] = [];
    let cur: number[] = [];
    let curSentences = 0;
    analysis.paragraphs.forEach((p, i) => {
      if (p.sentences) return;
      const n = splitSentences(p.text).length;
      if (cur.length && (curSentences + n > MAX_SENTENCES_PER_CALL || cur[cur.length - 1] !== i - 1)) {
        batches.push(cur);
        cur = [];
        curSentences = 0;
      }
      cur.push(i);
      curSentences += n;
    });
    if (cur.length) batches.push(cur);

    let cursor = 0;
    // Écritures sérialisées : chaque sauvegarde écrit l'état complet en mémoire.
    let saving: Promise<unknown> = Promise.resolve();
    const worker = async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        const paras = await analyzeParagraphs(
          batch.map((i) => ({ text: analysis.paragraphs[i].text, idx: i })),
          cands,
        );
        analysis = {
          ...analysis,
          paragraphs: analysis.paragraphs.map((p, j) => (batch.includes(j) ? paras[batch.indexOf(j)] : p)),
        };
        saving = saving.then(() => save());
        await saving;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    await save({ status: "READY", difficulty: difficultyOf(analysis) });
  } catch (e) {
    console.error("[reader] analyse du texte", textId, e);
    await save({ status: "FAILED", error: e instanceof Error ? e.message.slice(0, 300) : "Erreur inconnue" }).catch(() => {});
  }
}
