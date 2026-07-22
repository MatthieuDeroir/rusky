// Shared, framework-agnostic Russian grammar helpers.
// Used by the seed script (Node/tsx) AND the Next.js app, so keep it dependency-free.

export type WordType =
  | "noun"
  | "verb"
  | "adjective"
  | "pronoun"
  | "numeral"
  | "other";

export type LayoutId = "noun" | "adjective" | "verb" | "pronoun" | "numeral";

/**
 * Normalize a Russian word for lookup/comparison: strip stress marks, lowercase,
 * fold ё -> е (readers often type е for ё), collapse whitespace.
 */
export function normalizeBare(input: string): string {
  return input
    .normalize("NFC")
    .replace(/['́̀]/g, "") // apostrophe stress mark + combining accents
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip stress marks for display fallback while keeping ё. */
export function stripStress(input: string): string {
  return input.replace(/['́̀]/g, "");
}

/** Turn the dataset's "vowel + '" stress convention into a combining acute accent. */
export function displayAccent(input: string): string {
  return input.replace(/'/g, "́");
}

export type CaseCode = "nom" | "gen" | "dat" | "acc" | "inst" | "prep";

/** Extract the grammatical case from a formKey, or null for non-case forms (verb forms…). */
export function caseOf(formKey: string): CaseCode | null {
  const m = /(?:^(?:sg|pl|prn|num)|decl_(?:m|f|n|pl))_(nom|gen|dat|acc|inst|prep)$/.exec(formKey);
  return m ? (m[1] as CaseCode) : null;
}

/** Normalize a French answer for comparison: strip accents/diacritics, unify apostrophes,
 * lowercase, trim. Apostrophe styles (’ ' ʼ ` ´) and a leading article are folded so e.g.
 * "s'il vous plait" matches "s’il vous plaît". */
export function normalizeFr(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘ʼ`´]/g, "'")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Labels (French — the user works in French) -------------------------------

const CASE_LABELS: Record<string, string> = {
  nom: "Nominatif",
  acc: "Accusatif",
  gen: "Génitif",
  dat: "Datif",
  inst: "Instrumental",
  prep: "Prépositionnel",
};

const NUMBER_LABELS: Record<string, string> = {
  sg: "singulier",
  pl: "pluriel",
};

const GENDER_LABELS: Record<string, string> = {
  m: "masculin",
  f: "féminin",
  n: "neutre",
  pl: "pluriel",
};

const PERSON_LABELS: Record<string, string> = {
  sg1: "я (je)",
  sg2: "ты (tu)",
  sg3: "он/она/оно (il/elle)",
  pl1: "мы (nous)",
  pl2: "вы (vous)",
  pl3: "они (ils/elles)",
};

export const WORD_TYPE_LABELS: Record<WordType, string> = {
  noun: "Nom",
  verb: "Verbe",
  adjective: "Adjectif",
  pronoun: "Pronom",
  numeral: "Numéral",
  other: "Invariable",
};

/** Human-readable French label for any formKey. */
export function describeFormKey(formKey: string): string {
  // noun: sg_gen / pl_nom ...
  let m = /^(sg|pl)_(nom|gen|dat|acc|inst|prep)$/.exec(formKey);
  if (m) return `${CASE_LABELS[m[2]]} ${NUMBER_LABELS[m[1]]}`;

  // adjective / один / наш: decl_m_gen ...
  m = /^decl_(m|f|n|pl)_(nom|gen|dat|acc|inst|prep)$/.exec(formKey);
  if (m) return `${CASE_LABELS[m[2]]} ${GENDER_LABELS[m[1]]}`;

  // pronoun: prn_gen ; numeral: num_gen
  m = /^(prn|num)_(nom|gen|dat|acc|inst|prep)$/.exec(formKey);
  if (m) return CASE_LABELS[m[2]];

  // short adjective forms
  m = /^short_(m|f|n|pl)$/.exec(formKey);
  if (m) return `Forme courte ${GENDER_LABELS[m[1]]}`;

  // verb
  m = /^presfut_(sg1|sg2|sg3|pl1|pl2|pl3)$/.exec(formKey);
  if (m) return `Présent/Futur — ${PERSON_LABELS[m[1]]}`;
  m = /^past_(m|f|n|pl)$/.exec(formKey);
  if (m) return `Passé ${GENDER_LABELS[m[1]]}`;
  if (formKey === "imperative_sg") return "Impératif (ты)";
  if (formKey === "imperative_pl") return "Impératif (вы)";

  return formKey;
}

// ---- Paradigm layouts ---------------------------------------------------------

export interface ParadigmRow {
  label: string;
  /** One formKey per column (null = cell does not exist). */
  cells: (string | null)[];
}
export interface ParadigmSection {
  title: string;
  /** Column headers; empty array means a single unlabeled column. */
  columns: string[];
  rows: ParadigmRow[];
}

const SIX_CASES = ["nom", "gen", "dat", "acc", "inst", "prep"] as const;

/** Decide which table layout to use from the set of formKeys an entry actually has. */
export function getLayout(formKeys: string[]): LayoutId {
  const has = (p: string) => formKeys.some((k) => k.startsWith(p));
  if (has("sg_") || has("pl_")) return "noun";
  if (has("presfut_") || has("past_") || has("imperative_")) return "verb";
  if (has("decl_")) return "adjective";
  if (has("prn_")) return "pronoun";
  if (has("num_")) return "numeral";
  return "noun";
}

/** Build the table structure (formKey templates only) for a layout. */
export function buildSections(layout: LayoutId): ParadigmSection[] {
  switch (layout) {
    case "noun":
      return [
        {
          title: "Déclinaison",
          columns: ["Singulier", "Pluriel"],
          rows: SIX_CASES.map((c) => ({
            label: CASE_LABELS[c],
            cells: [`sg_${c}`, `pl_${c}`],
          })),
        },
      ];
    case "adjective":
      return [
        {
          title: "Déclinaison",
          columns: ["Masculin", "Féminin", "Neutre", "Pluriel"],
          rows: SIX_CASES.map((c) => ({
            label: CASE_LABELS[c],
            cells: [
              `decl_m_${c}`,
              `decl_f_${c}`,
              `decl_n_${c}`,
              `decl_pl_${c}`,
            ],
          })),
        },
        {
          title: "Formes courtes",
          columns: ["Masculin", "Féminin", "Neutre", "Pluriel"],
          rows: [
            {
              label: "Court",
              cells: ["short_m", "short_f", "short_n", "short_pl"],
            },
          ],
        },
      ];
    case "pronoun":
      return [
        {
          title: "Déclinaison",
          columns: [],
          rows: SIX_CASES.map((c) => ({
            label: CASE_LABELS[c],
            cells: [`prn_${c}`],
          })),
        },
      ];
    case "numeral":
      return [
        {
          title: "Déclinaison",
          columns: [],
          rows: SIX_CASES.map((c) => ({
            label: CASE_LABELS[c],
            cells: [`num_${c}`],
          })),
        },
      ];
    case "verb":
      return [
        {
          title: "Présent / Futur",
          columns: [],
          rows: (["sg1", "sg2", "sg3", "pl1", "pl2", "pl3"] as const).map(
            (p) => ({ label: PERSON_LABELS[p], cells: [`presfut_${p}`] }),
          ),
        },
        {
          title: "Passé",
          columns: [],
          rows: (["m", "f", "n", "pl"] as const).map((g) => ({
            label: GENDER_LABELS[g],
            cells: [`past_${g}`],
          })),
        },
        {
          title: "Impératif",
          columns: [],
          rows: [
            { label: "ты (tu)", cells: ["imperative_sg"] },
            { label: "вы (vous)", cells: ["imperative_pl"] },
          ],
        },
      ];
  }
}

/** All formKeys a given layout can contain (used for completion totals). */
export function layoutFormKeys(layout: LayoutId): string[] {
  return buildSections(layout)
    .flatMap((s) => s.rows)
    .flatMap((r) => r.cells)
    .filter((k): k is string => k !== null);
}
