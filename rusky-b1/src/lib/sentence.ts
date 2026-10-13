// Offline case-government checker. Given tokens already recognized against the dictionary
// (their possible cases + part of speech), it applies deterministic rules — preposition
// government, verb rection (curated), adjacent adjective↔noun case agreement — and reports
// issues. It is lenient: a word with several readings passes if ANY reading fits.
import type { CaseCode } from "./grammar";

export const CASE_FR: Record<CaseCode, string> = {
  nom: "nominatif",
  acc: "accusatif",
  gen: "génitif",
  dat: "datif",
  inst: "instrumental",
  prep: "prépositionnel",
};

/** Preposition → the case(s) it governs (normalized, lowercase). */
export const PREPOSITION_CASES: Record<string, CaseCode[]> = {
  в: ["acc", "prep"], во: ["acc", "prep"],
  на: ["acc", "prep"],
  за: ["acc", "inst"],
  под: ["acc", "inst"], подо: ["acc", "inst"],
  о: ["prep"], об: ["prep"], обо: ["prep"],
  при: ["prep"],
  с: ["gen", "inst"], со: ["gen", "inst"],
  к: ["dat"], ко: ["dat"],
  по: ["dat"],
  из: ["gen"], "из-за": ["gen"], "из-под": ["gen"],
  от: ["gen"], ото: ["gen"],
  до: ["gen"], для: ["gen"], без: ["gen"], у: ["gen"],
  около: ["gen"], возле: ["gen"], вокруг: ["gen"], после: ["gen"],
  против: ["gen"], среди: ["gen"], кроме: ["gen"], ради: ["gen"], мимо: ["gen"],
  через: ["acc"], про: ["acc"], сквозь: ["acc"],
  над: ["inst"], надо: ["inst"], перед: ["inst"], передо: ["inst"], между: ["inst"],
};

/** Verbs that govern a non-accusative case (curated). Lemma (normalized) → case. */
export const VERB_CASES: Record<string, CaseCode> = {
  помогать: "dat", помочь: "dat", мешать: "dat", звонить: "dat", позвонить: "dat",
  верить: "dat", советовать: "dat", нравиться: "dat", принадлежать: "dat", удивляться: "dat",
  бояться: "gen", достигать: "gen", желать: "gen",
  заниматься: "inst", пользоваться: "inst", управлять: "inst", интересоваться: "inst",
  гордиться: "inst", руководить: "inst",
};

export interface Tok {
  raw: string;
  norm: string;
  recognized: boolean; // found in dictionary or a known preposition
  cases: CaseCode[]; // possible cases from morphological analysis
  isNominal: boolean; // noun / adjective / pronoun / numeral
  isAdjective: boolean;
  isNoun: boolean;
  verbLemmas: string[]; // verb lemma(s) for rection
  prepCases: CaseCode[] | null; // set if the token is a preposition
}

export interface SentenceIssue {
  index: number; // token index the issue points at
  message: string;
}

const vowel = (c: CaseCode) => /^[aeiouéè]/i.test(CASE_FR[c]);
// "le génitif" / "l'accusatif"
const le = (cs: CaseCode[]) =>
  cs.map((c) => (vowel(c) ? `l'${CASE_FR[c]}` : `le ${CASE_FR[c]}`)).join(" ou ");
// "au génitif" / "à l'accusatif"
const au = (cs: CaseCode[]) =>
  cs.map((c) => (vowel(c) ? `à l'${CASE_FR[c]}` : `au ${CASE_FR[c]}`)).join(" ou ");
const plain = (cs: CaseCode[]) => cs.map((c) => CASE_FR[c]).join(" ou ");

/** Apply the government/agreement rules to recognized tokens. */
export function analyzeTokens(toks: Tok[]): SentenceIssue[] {
  const issues: SentenceIssue[] = [];
  const nextNominal = (from: number) => {
    for (let j = from; j < toks.length; j++) {
      if (toks[j].prepCases) return -1; // another preposition first → stop
      if (toks[j].isNominal) return j;
    }
    return -1;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];

    // Unknown Cyrillic word.
    if (!t.recognized && /[а-яё]/i.test(t.raw)) {
      issues.push({ index: i, message: `Mot inconnu : « ${t.raw} » (introuvable).` });
      continue;
    }

    // Preposition government.
    if (t.prepCases) {
      const j = nextNominal(i + 1);
      if (j >= 0 && toks[j].cases.length > 0) {
        const ok = toks[j].cases.some((c) => t.prepCases!.includes(c));
        if (!ok) {
          issues.push({
            index: j,
            message: `Après « ${t.raw} » on attend ${le(t.prepCases)} ; « ${toks[j].raw} » est ${au(toks[j].cases)}.`,
          });
        }
      }
    }

    // Verb rection (curated verbs).
    const govLemma = t.verbLemmas.find((l) => VERB_CASES[l]);
    if (govLemma) {
      const need = VERB_CASES[govLemma];
      const j = nextNominal(i + 1);
      if (j >= 0 && toks[j].cases.length > 0 && !toks[j].cases.includes(need)) {
        issues.push({
          index: j,
          message: `« ${t.raw} » régit ${le([need])} ; « ${toks[j].raw} » est ${au(toks[j].cases)}.`,
        });
      }
    }

    // Adjacent adjective ↔ noun: must share a case.
    if (t.isAdjective && i + 1 < toks.length && toks[i + 1].isNoun) {
      const n = toks[i + 1];
      if (t.cases.length > 0 && n.cases.length > 0) {
        const ok = t.cases.some((c) => n.cases.includes(c));
        if (!ok) {
          issues.push({
            index: i,
            message: `Accord : « ${t.raw} » (${plain(t.cases)}) et « ${n.raw} » (${plain(n.cases)}) ne partagent aucun cas.`,
          });
        }
      }
    }
  }
  return issues;
}
