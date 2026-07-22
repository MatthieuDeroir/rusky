// Derives the conjugation / declension rules of a word from the data we have, and groups
// the rule lines by the paradigm SECTION they belong to (so each rule sits in its own
// table). Section keys must match the titles produced by buildSections() in grammar.ts.
// Framework-agnostic. French output.
import { stripStress } from "./grammar";

/** Rule lines keyed by paradigm-section title (e.g. "Présent / Futur", "Déclinaison"). */
export type RuleMap = Record<string, string[]>;

type Forms = Map<string, string[]>;

const low = (s: string) => stripStress(s).toLowerCase().trim();
const first = (forms: Forms, key: string) => forms.get(key)?.[0];

const INF_GROUPS = ["ать", "ять", "еть", "ить", "оть", "уть", "ыть", "ти", "чь"];

const PERSON_KEYS: [string, string][] = [
  ["presfut_sg1", "я"],
  ["presfut_sg2", "ты"],
  ["presfut_sg3", "он/она"],
  ["presfut_pl1", "мы"],
  ["presfut_pl2", "вы"],
  ["presfut_pl3", "они"],
];

const caseKeys = (prefix: string): [string, string][] => [
  [`${prefix}_nom`, "Nom"],
  [`${prefix}_gen`, "Gén"],
  [`${prefix}_dat`, "Dat"],
  [`${prefix}_acc`, "Acc"],
  [`${prefix}_inst`, "Inst"],
  [`${prefix}_prep`, "Prép"],
];

// Oblique cases reveal the true stem (nominative can hide a fleeting vowel / zero ending).
const obliqueKeys = (prefix: string): [string, string][] => [
  [`${prefix}_gen`, "Gén"],
  [`${prefix}_dat`, "Dat"],
  [`${prefix}_inst`, "Inst"],
  [`${prefix}_prep`, "Prép"],
];

function commonPrefix(words: string[]): string {
  if (words.length === 0) return "";
  let p = words[0];
  for (const w of words.slice(1)) {
    let i = 0;
    while (i < p.length && i < w.length && p[i] === w[i]) i++;
    p = p.slice(0, i);
    if (!p) break;
  }
  return p;
}

/** Common stem (shared prefix) of the given forms. */
function stemOf(forms: Forms, specs: [string, string][]): string {
  return commonPrefix(
    specs.map(([k]) => first(forms, k)).filter((w): w is string => !!w).map(low),
  );
}

/**
 * "Nom -∅ · Gén -и · …" — endings of `specs` forms relative to a stem computed from
 * `stemKeys` (use a wider set, e.g. all genders, to avoid absorbing a shared linking vowel).
 * Returns null if the forms are suppletive (no shared stem).
 */
function endingsRelative(
  forms: Forms,
  stemKeys: string[],
  specs: [string, string][],
): string | null {
  const stemWords = stemKeys
    .map((k) => first(forms, k))
    .filter((w): w is string => !!w)
    .map(low);
  if (stemWords.length < 2) return null;
  const stem = commonPrefix(stemWords);
  if (stem.length < 1) return null;
  const items = specs
    .map(([k, label]) => ({ label, form: first(forms, k) }))
    .filter((x): x is { label: string; form: string } => !!x.form);
  if (items.length < 1) return null;
  return items.map((x) => `${x.label} -${low(x.form).slice(stem.length) || "∅"}`).join(" · ");
}

/** Endings derived from a single sub-group (stem = common prefix of those forms). */
function endingsLine(forms: Forms, specs: [string, string][]): string | null {
  return endingsRelative(
    forms,
    specs.map((s) => s[0]),
    specs,
  );
}

/**
 * Like endingsRelative but shows the FULL form (accented) when it doesn't sit on the stem
 * (fleeting vowel / irregular nominative), e.g. "Nom оте́ц · Gén -а · …".
 */
function endingsOrForms(forms: Forms, stem: string, specs: [string, string][]): string | null {
  const items = specs
    .map(([k, label]) => ({ label, form: first(forms, k) }))
    .filter((x): x is { label: string; form: string } => !!x.form);
  if (items.length < 1 || !stem) return null;
  return items
    .map((x) =>
      low(x.form).startsWith(stem)
        ? `${x.label} -${low(x.form).slice(stem.length) || "∅"}`
        : `${x.label} ${x.form}`,
    )
    .join(" · ");
}

/** Nominative plural to show in the header when the plural stem differs (челове́к / лю́ди). */
export function pluralHeadword(forms: Forms): string | null {
  const sg = stemOf(forms, obliqueKeys("sg"));
  const pl = stemOf(forms, obliqueKeys("pl"));
  if (!sg || !pl || sg === pl) return null;
  return first(forms, "pl_nom") ?? null;
}

/** Verbs: present/futur, passé and impératif rules, each in its own section. */
// Personal endings per present-tense person (longest first so stripping is unambiguous).
const PRES_ENDINGS: [string, RegExp][] = [
  ["presfut_sg2", /(ешь|ёшь|ишь)$/],
  ["presfut_sg3", /(ет|ёт|ит)$/],
  ["presfut_pl1", /(ем|ём|им)$/],
  ["presfut_pl2", /(ете|ёте|ите)$/],
  ["presfut_pl3", /(ут|ют|ат|ят)$/],
];

/** True if the present-tense stem's final consonant changes across persons (an irregular
 * alternation like мочь могу́/мо́жешь/мо́гут). The 1st pers. sg is excluded because its
 * mutation (любить → люблю) is a regular feature of the 2nd conjugation. */
function presentStemVaries(forms: Forms, deReflex: (s: string) => string): boolean {
  const lasts = new Set<string>();
  for (const [key, re] of PRES_ENDINGS) {
    const raw = forms.get(key)?.[0];
    if (!raw) continue;
    const stem = deReflex(low(raw)).replace(re, "");
    if (stem) lasts.add(stem[stem.length - 1]);
  }
  return lasts.size > 1;
}

export function analyzeVerb(accented: string, forms: Forms): RuleMap {
  let inf = low(accented);
  const present: string[] = [];

  const reflexive = inf.endsWith("ся") || inf.endsWith("сь");
  if (reflexive) {
    present.push("Verbe pronominal (réfléchi, en -ся/-сь).");
    inf = inf.replace(/с[яь]$/, "");
  }
  const group = INF_GROUPS.find((g) => inf.endsWith(g));
  if (group) present.push(`Groupe : verbes en -${group}${reflexive ? "ся" : ""}.`);

  // Single source of truth: the same classifier used by the theme buckets (verbClass), so the
  // rule text and the grouping can never disagree (мочь = irregular in both).
  switch (verbClass(forms)) {
    case "1":
      present.push("1re conjugaison (type -е-).");
      present.push("Terminaisons : -ю/-у, -ешь, -ет, -ем, -ете, -ут/-ют.");
      break;
    case "2":
      present.push("2e conjugaison (type -и-).");
      present.push("Terminaisons : -ю/-у, -ишь, -ит, -им, -ите, -ат/-ят.");
      present.push("⚠ Alternance consonantique possible à la 1re pers. (ex. любить → люблю).");
      break;
    default: {
      // Irregular: endings or stem don't follow a single class (мочь могу́/мо́жешь/мо́гут).
      const line = endingsLine(forms, PERSON_KEYS);
      present.push("⚠ Verbe irrégulier : radical/terminaisons non réguliers — consulte le tableau.");
      if (line) present.push(`Terminaisons : ${line}.`);
    }
  }

  const past = ["Passé : radical de l'infinitif + -л (m), -ла (f), -ло (n), -ли (pl)."];

  const imperative: string[] = [];
  if (forms.has("imperative_sg") || forms.has("imperative_pl")) {
    const shown = [first(forms, "imperative_sg"), first(forms, "imperative_pl")]
      .filter(Boolean)
      .join(" / ");
    imperative.push(
      `2ᵉ pers. en -й / -и / -ь, pluriel + -те${shown ? ` (ex. ${shown})` : ""}.`,
    );
  }

  return {
    "Présent / Futur": present,
    Passé: past,
    Impératif: imperative,
  };
}

/** Nouns: school declension class + singular & plural endings. */
export function analyzeNoun(
  gender: string | null,
  forms: Forms,
  indeclinable: boolean | null,
  plOnly: boolean | null,
): RuleMap {
  const lines: string[] = [];
  if (indeclinable) {
    return { Déclinaison: ["Nom indéclinable — forme invariable à tous les cas."] };
  }
  if (plOnly) lines.push("Pluralia tantum (s'emploie seulement au pluriel).");

  const n = low(first(forms, "sg_nom") ?? "");
  // Single source of truth: the class comes from nounClass (used by the theme buckets too).
  const cls = nounClass(gender, forms, indeclinable, plOnly);
  if (cls === "1") lines.push("1re déclinaison — noms en -а/-я.");
  else if (cls === "2") lines.push("2e déclinaison — masculin à finale dure ou neutre en -о/-е.");
  else if (cls === "3") lines.push("3e déclinaison — féminin en -ь.");
  else if (n.endsWith("мя"))
    lines.push("Nom neutre en -мя : déclinaison hétéroclite (имя, время…), insertion de -ен-.");

  const isDecl = cls === "1" || cls === "2" || cls === "3";
  const soft = /[яеёйь]$/.test(n);
  if (isDecl) lines.push(soft ? "Radical mou (variantes -я/-е/-ю)." : "Radical dur.");

  // Stems are read from the OBLIQUE cases (the nominative can hide a fleeting vowel).
  const sgStem = stemOf(forms, obliqueKeys("sg"));
  const plStem = stemOf(forms, obliqueKeys("pl"));

  if (sgStem) {
    const sgNom = low(first(forms, "sg_nom") ?? "");
    if (sgNom && !sgNom.startsWith(sgStem)) {
      lines.push("Voyelle mobile au nominatif singulier (radical réduit aux autres cas).");
    }
    const sg = endingsOrForms(forms, sgStem, caseKeys("sg"));
    if (sg) lines.push(`Singulier — radical « ${sgStem}- » : ${sg}.`);
  }

  if (plStem) {
    const pl = endingsOrForms(forms, plStem, caseKeys("pl"));
    if (pl) {
      if (plStem === sgStem) {
        lines.push(`Pluriel — même radical : ${pl}.`);
      } else {
        // Plural built on a different stem (человек → люди, брат → братья…).
        const ex = first(forms, "pl_nom");
        lines.push(
          `Pluriel — radical « ${plStem}- »${ex ? ` (ex. ${ex})` : ""} : ${pl}.`,
        );
      }
    }
  }

  return lines.length ? { Déclinaison: lines } : {};
}

/** Adjectives: hard/soft/mixed stem + masc-sing & plural endings. */
export function analyzeAdjective(forms: Forms): RuleMap {
  const m = low(first(forms, "decl_m_nom") ?? "");
  if (!/(ой|ый|ий)$/.test(m)) return {};
  const lines: string[] = [];

  // Single source of truth: hard/soft/mixed comes from adjClass (used by the theme buckets);
  // the ending-specific wording (ой vs ый, vélaire vs chuintante) is display detail only.
  switch (adjClass(forms)) {
    case "hard":
      lines.push(m.endsWith("ой") ? "Radical dur, terminaisons accentuées (-ой)." : "Radical dur (-ый).");
      break;
    case "soft":
      lines.push("Radical mou (-ий).");
      break;
    case "mixed": {
      const stemLast = m.slice(0, -2).slice(-1);
      if ("кгх".includes(stemLast))
        lines.push(`Radical mixte (vélaire ${stemLast}) — règle orthographique : и au lieu de ы.`);
      else lines.push(`Radical mixte (chuintante ${stemLast}) — règles orthographiques.`);
      break;
    }
  }

  const allDecl = (["m", "f", "n", "pl"] as const).flatMap((g) =>
    caseKeys(`decl_${g}`).map((s) => s[0]),
  );
  const sgM = endingsRelative(forms, allDecl, caseKeys("decl_m"));
  if (sgM) lines.push(`Terminaisons (masc. sing.) : ${sgM}.`);
  const plE = endingsRelative(forms, allDecl, caseKeys("decl_pl"));
  if (plE) lines.push(`Terminaisons (pluriel) : ${plE}.`);

  return { Déclinaison: lines };
}

/** Numerals: declension endings (num_* or, for один, decl_m_*). */
export function analyzeNumeral(forms: Forms): RuleMap {
  const line = endingsLine(forms, caseKeys("num")) ?? endingsLine(forms, caseKeys("decl_m"));
  return {
    Déclinaison: line
      ? ["Numéral — déclinaison.", `Terminaisons : ${line}.`]
      : ["Numéral à déclinaison particulière — voir le tableau."],
  };
}

/** Pronouns: declension endings, or note suppletive forms (я, он, …). */
export function analyzePronoun(forms: Forms): RuleMap {
  const line = endingsLine(forms, caseKeys("prn")) ?? endingsLine(forms, caseKeys("decl_m"));
  return {
    Déclinaison: line
      ? ["Pronom — déclinaison.", `Terminaisons : ${line}.`]
      : ["Pronom à formes supplétives (radical variable) — voir le tableau."],
  };
}

// ---- Classifiers (theme buckets for the Exercices page) --------------------------

export type VerbClass = "1" | "2" | "irregular";
export type NounClass = "1" | "2" | "3" | "special";
export type AdjClass = "hard" | "soft" | "mixed";

/** Conjugation class read from the present/future endings (ты + они must agree). A verb whose
 * present stem alternates across persons (мочь могу́/мо́жешь/мо́гут) is irregular, even when the
 * endings look like a regular class. */
export function verbClass(forms: Forms): VerbClass {
  const deReflex = (s: string) => s.replace(/с[яь]$/, "");
  if (presentStemVaries(forms, deReflex)) return "irregular";
  const tu = forms.get("presfut_sg2")?.[0] ? deReflex(low(first(forms, "presfut_sg2")!)) : "";
  const ils = forms.get("presfut_pl3")?.[0] ? deReflex(low(first(forms, "presfut_pl3")!)) : "";
  const tu1 = tu.endsWith("ешь") || tu.endsWith("ёшь");
  const tu2 = tu.endsWith("ишь");
  const ils1 = ils.endsWith("ут") || ils.endsWith("ют");
  const ils2 = ils.endsWith("ат") || ils.endsWith("ят");
  if (tu && ils) {
    if (tu1 && ils1) return "1";
    if (tu2 && ils2) return "2";
    return "irregular";
  }
  if (tu) return tu1 ? "1" : tu2 ? "2" : "irregular";
  if (ils) return ils1 ? "1" : ils2 ? "2" : "irregular";
  return "irregular";
}

/** School declension class from gender + nominative ending. */
export function nounClass(
  gender: string | null,
  forms: Forms,
  indeclinable: boolean | null,
  plOnly: boolean | null,
): NounClass {
  if (indeclinable || plOnly) return "special";
  const n = low(first(forms, "sg_nom") ?? "");
  if (!n || n.endsWith("мя")) return "special";
  if (n.endsWith("а") || n.endsWith("я")) return "1";
  if (gender === "f" && n.endsWith("ь")) return "3";
  if (gender === "m" || n.endsWith("й") || n.endsWith("ь")) return "2";
  if (gender === "n" && /[оеё]$/.test(n)) return "2";
  return "special";
}

/** Adjective stem type from the masculine nominative ending. */
export function adjClass(forms: Forms): AdjClass {
  const m = low(first(forms, "decl_m_nom") ?? "");
  if (m.endsWith("ий")) {
    const last = m.slice(0, -2).slice(-1);
    return "кгхжшчщ".includes(last) ? "mixed" : "soft";
  }
  return "hard";
}
