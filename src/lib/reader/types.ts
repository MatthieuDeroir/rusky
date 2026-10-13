// Types partagés du Lecteur (serveur + client). L'analyse d'un texte est stockée telle quelle en
// JSON dans ReadingText.analysis — changer une forme ici = incrémenter ANALYSIS_VERSION.
import type { WordType } from "@/lib/grammar";

export const ANALYSIS_VERSION = "reader-v1";

/** Fonction d'un mot dans la phrase — c'est ce que le mode structure colore. Les mots d'un même
 * groupe nominal (adjectif, possessif…) prennent le rôle de leur nom. */
export type Role =
  | "subject" // sujet (nominatif)
  | "verb" // verbe conjugué, infinitif, prédicat (можно, нужно, рад…)
  | "object" // COD (accusatif, génitif de négation)
  | "indirect" // datif : à qui / pour qui, y compris мне нравится
  | "complement" // groupe prépositionnel, génitif, instrumental, attribut, adverbe
  | "preposition"
  | "conjunction"
  | "other"; // particule, interjection…

export const ROLES: Role[] = [
  "subject",
  "verb",
  "object",
  "indirect",
  "complement",
  "preposition",
  "conjunction",
  "other",
];

export const ROLE_LABEL: Record<Role, string> = {
  subject: "Sujet",
  verb: "Verbe",
  object: "COD",
  indirect: "À qui (datif)",
  complement: "Complément",
  preposition: "Préposition",
  conjunction: "Liaison",
  other: "Autre",
};

/** Propositions non principales : ce sont elles qui rendent une phrase russe opaque. */
export type ClauseKind =
  | "relative" // который / кто / что relatif
  | "completive" // что, ли (« il dit que… »)
  | "purpose" // чтобы
  | "condition" // если, бы
  | "time" // когда, пока, после того как
  | "cause" // потому что, так как
  | "participle" // participiale
  | "gerund" // gérondive
  | "other";

export const CLAUSE_KINDS: ClauseKind[] = [
  "relative",
  "completive",
  "purpose",
  "condition",
  "time",
  "cause",
  "participle",
  "gerund",
  "other",
];

export const CLAUSE_LABEL: Record<ClauseKind, string> = {
  relative: "relative",
  completive: "« que… »",
  purpose: "« pour que… »",
  condition: "condition",
  time: "temps",
  cause: "cause",
  participle: "participiale",
  gerund: "gérondive",
  other: "subordonnée",
};

/** Structures de lecture repérables dans une phrase — servent au curriculum (une unité = un ou
 * plusieurs tags) et au choix des textes. */
export const STRUCTURE_TAGS = [
  "acc-object",
  "free-word-order",
  "genitive",
  "negation-genitive",
  "u-menya-est",
  "prepositional-place",
  "dative",
  "impersonal",
  "instrumental",
  "aspect",
  "motion-verb",
  "relative-kotoryj",
  "subordinate",
  "short-adjective",
  "comparative",
  "active-participle",
  "passive-participle",
  "reflexive-passive",
  "gerund",
] as const;
export type StructureTag = (typeof STRUCTURE_TAGS)[number];

export interface ReaderWord {
  raw: string;
  /** Entrée du dictionnaire retenue (null = mot inconnu du dictionnaire). */
  entryId: number | null;
  /** Lemme accentué, prêt à afficher (accent combinant). */
  lemma: string;
  type: WordType | null;
  /** Case du paradigme (null = forme du dictionnaire, ou forme absente du dictionnaire :
   * participe, gérondif, comparatif…). */
  formKey: string | null;
  formLabel: string;
  /** Forme accentuée (accent combinant) quand le dictionnaire la connaît. */
  formAccented: string | null;
  /** Traductions du dictionnaire. */
  dictFr: string | null;
  /** Traduction dans ce contexte. */
  gloss: string;
  role: Role;
  /** Pourquoi cette forme ici (« accusatif : COD de любит »). */
  reason: string;
  /** false = analyse IA non confirmée par le dictionnaire (mot inconnu, ou lecture corrigée). */
  verified: boolean;
}

/** Un morceau de la phrase tel qu'écrit : mot (w = index dans words) ou ponctuation/espaces. */
export interface ReaderToken {
  t: string;
  w?: number;
}

export interface ReaderClause {
  from: number; // index de mot (inclus)
  to: number; // index de mot (inclus)
  kind: ClauseKind;
}

export interface ReaderSentence {
  tokens: ReaderToken[];
  words: ReaderWord[];
  translation: string;
  literal: string;
  skeleton: string;
  clauses: ReaderClause[];
  structures: StructureTag[];
}

export interface ReaderQuestion {
  id: string; // stable : "p<para>-<n>"
  /** Index de phrase dans le paragraphe après laquelle la question a du sens. */
  afterSentence: number;
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface ReaderParagraph {
  text: string;
  /** null = pas encore analysé. */
  sentences: ReaderSentence[] | null;
  questions: ReaderQuestion[];
  failed?: boolean;
}

export interface ReaderAnalysis {
  version: string;
  paragraphs: ReaderParagraph[];
}

export type ReadingStatus = "GENERATING" | "PENDING" | "ANALYZING" | "READY" | "FAILED";

export interface ReaderAnswer {
  choice: number;
  correct: boolean;
}
