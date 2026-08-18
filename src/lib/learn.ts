// Scopes for the "Apprendre" exercises: a narrow slice of the paradigm space (a declension or
// conjugation class, optionally restricted to singular or plural) that can be drilled on its
// own. Pure data + predicates, no DB deps — usable from server actions and client components.
import { numberOfFormKey, type WordType } from "./grammar";
import { adjClass, nounClass, verbClass, type Forms } from "./morphology";

/** How a scope is practised. */
export type DrillMode =
  | "discover" // trial and error: guess blind → rule → retry (regular, rule-governed forms)
  | "rote"; // matraquage: repeat until it sticks (irregulars, nothing to deduce)

export type ScopeGroup = "declension" | "conjugation" | "irregular";

export interface LearnScope {
  key: string;
  label: string;
  group: ScopeGroup;
  mode: DrillMode;
  type: WordType;
  /** Class within the type ("1" | "2" | "3" | "special" | "hard" | "soft" | "mixed" | "irregular"). */
  cls: string | null;
  /** Restrict to singular or plural cells; null = every cell of the class. */
  number: "sg" | "pl" | null;
  blurb: string;
}

const NOUN_CLASS_LABEL: Record<string, string> = {
  "1": "1re déclinaison (-а/-я)",
  "2": "2e déclinaison (masc. / -о, -е)",
  "3": "3e déclinaison (fém. -ь)",
};
const ADJ_CLASS_LABEL: Record<string, string> = {
  hard: "radical dur",
  soft: "radical mou",
  mixed: "radical mixte",
};
const VERB_CLASS_LABEL: Record<string, string> = {
  "1": "1re conjugaison",
  "2": "2e conjugaison",
};

function numberLabel(n: "sg" | "pl"): string {
  return n === "sg" ? "singulier" : "pluriel";
}

/** Every scope the app knows about, in presentation order. Availability (does the user have
 * words for it?) is computed separately, against the collection. */
export function allScopes(): LearnScope[] {
  const out: LearnScope[] = [];

  // Nouns: each school declension class, split singular / plural.
  for (const cls of ["1", "2", "3"]) {
    for (const number of ["sg", "pl"] as const) {
      out.push({
        key: `noun-${cls}-${number}`,
        label: `Noms — ${NOUN_CLASS_LABEL[cls]}, ${numberLabel(number)}`,
        group: "declension",
        mode: "discover",
        type: "noun",
        cls,
        number,
        blurb: "Les 6 cas de cette classe, un à un.",
      });
    }
  }

  // Adjectives: by stem type, split singular (m/f/n) / plural.
  for (const cls of ["hard", "soft", "mixed"]) {
    for (const number of ["sg", "pl"] as const) {
      out.push({
        key: `adj-${cls}-${number}`,
        label: `Adjectifs — ${ADJ_CLASS_LABEL[cls]}, ${numberLabel(number)}`,
        group: "declension",
        mode: "discover",
        type: "adjective",
        cls,
        number,
        blurb: "Accords en genre et en cas.",
      });
    }
  }

  out.push({
    key: "pronoun",
    label: "Pronoms — déclinaison",
    group: "declension",
    mode: "discover",
    type: "pronoun",
    cls: null,
    number: null,
    blurb: "Formes closes, à reconnaître au cas près.",
  });
  out.push({
    key: "numeral",
    label: "Numéraux — déclinaison",
    group: "declension",
    mode: "discover",
    type: "numeral",
    cls: null,
    number: null,
    blurb: "Les numéraux se déclinent aussi.",
  });

  // Verbs: regular conjugation classes, split singular / plural persons.
  for (const cls of ["1", "2"]) {
    for (const number of ["sg", "pl"] as const) {
      out.push({
        key: `verb-${cls}-${number}`,
        label: `Verbes — ${VERB_CLASS_LABEL[cls]}, ${numberLabel(number)}`,
        group: "conjugation",
        mode: "discover",
        type: "verb",
        cls,
        number,
        blurb: "Présent/futur, passé et impératif de cette classe.",
      });
    }
  }

  // Irregulars: nothing to deduce → rote drilling until it sticks.
  out.push({
    key: "irr-verb",
    label: "Verbes irréguliers",
    group: "irregular",
    mode: "rote",
    type: "verb",
    cls: "irregular",
    number: null,
    blurb: "Aucune règle à déduire : matraquage jusqu’à ce que ça rentre.",
  });
  out.push({
    key: "irr-noun",
    label: "Noms particuliers",
    group: "irregular",
    mode: "rote",
    type: "noun",
    cls: "special",
    number: null,
    blurb: "Indéclinables, pluriels irréguliers, -мя : à savoir par cœur.",
  });

  return out;
}

export function findScope(key: string): LearnScope | null {
  return allScopes().find((s) => s.key === key) ?? null;
}

export const GROUP_LABEL: Record<ScopeGroup, string> = {
  declension: "Déclinaisons",
  conjugation: "Conjugaisons",
  irregular: "Par cœur",
};

/** Does an entry belong to this scope's type + class? */
export function entryInScope(
  scope: LearnScope,
  entry: { type: string; gender: string | null; indeclinable: boolean | null; plOnly: boolean | null },
  forms: Forms,
): boolean {
  if (entry.type !== scope.type) return false;
  if (scope.cls === null) return true;
  switch (scope.type) {
    case "noun":
      return nounClass(entry.gender, forms, entry.indeclinable, entry.plOnly) === scope.cls;
    case "adjective":
      return adjClass(forms) === scope.cls;
    case "verb":
      return verbClass(forms) === scope.cls;
    default:
      return true;
  }
}

/** Does a paradigm cell belong to this scope's number restriction? */
export function formKeyInScope(scope: LearnScope, formKey: string): boolean {
  if (scope.number === null) return true;
  return numberOfFormKey(formKey) === scope.number;
}
