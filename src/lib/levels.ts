// Grammatical-completion levels, shared by the dashboard, the validation test and the server
// actions. Pure data + helpers (no deps) so it's usable from both client and server.
//
// A level is *reached* when enough paradigm cells of its family are filled, but only becomes
// the displayed title once *validated* by passing a control test (growing difficulty). Labels
// are neutral coverage tiers — they make no CEFR / communicative-proficiency claim.

export interface Milestone {
  n: number; // cumulative filled forms of the family needed to REACH this tier
  label: string;
  blurb: string;
}

/** Grammatical-form tracks (cells of paradigms). */
export type Track = "declension" | "conjugation";
/** Any validatable track, including vocabulary (number of distinct words known). */
export type LevelTrack = Track | "vocabulary";

/** Which word types feed each grammatical track. */
export const TRACK_FAMILIES: Record<Track, string[]> = {
  declension: ["noun", "adjective", "pronoun", "numeral"],
  conjugation: ["verb"],
};

export const TRACK_LABEL: Record<LevelTrack, string> = {
  declension: "Déclinaisons",
  conjugation: "Conjugaisons",
  vocabulary: "Vocabulaire",
};

export const TRACK_UNIT: Record<LevelTrack, string> = {
  declension: "formes déclinées",
  conjugation: "formes conjuguées",
  vocabulary: "mots",
};

export const DECLENSION_MILESTONES: Milestone[] = [
  { n: 15, label: "Néophyte", blurb: "Tes premières formes déclinées." },
  { n: 40, label: "Initié", blurb: "Nominatif et accusatif se mettent en place." },
  { n: 90, label: "Apprenti", blurb: "Génitif et datif apparaissent dans tes tableaux." },
  { n: 180, label: "Praticien", blurb: "Les 6 cas au singulier deviennent familiers." },
  { n: 350, label: "Confirmé", blurb: "Pluriels et cas obliques mieux couverts." },
  { n: 650, label: "Aguerri", blurb: "Une large part de tes noms et adjectifs est remplie." },
  { n: 1200, label: "Chevronné", blurb: "Accords adjectivaux et pluriels bien avancés." },
  { n: 2200, label: "Expert", blurb: "Déclinaisons rares et irrégulières incluses." },
  { n: 4000, label: "Virtuose", blurb: "Couverture très étendue des paradigmes nominaux." },
  { n: 7500, label: "Maître", blurb: "L’essentiel des formes déclinées est rempli." },
  { n: 14000, label: "Grand maître", blurb: "Couverture quasi exhaustive." },
  { n: 26000, label: "Complet", blurb: "Tous tes paradigmes nominaux ou presque." },
];

export const CONJUGATION_MILESTONES: Milestone[] = [
  { n: 12, label: "Néophyte", blurb: "Tes premières formes conjuguées." },
  { n: 30, label: "Initié", blurb: "Le présent des verbes courants se remplit." },
  { n: 70, label: "Apprenti", blurb: "Passé et futur apparaissent dans tes tableaux." },
  { n: 140, label: "Praticien", blurb: "Les deux aspects commencent à se couvrir." },
  { n: 260, label: "Confirmé", blurb: "Impératif et présent mieux couverts." },
  { n: 480, label: "Aguerri", blurb: "Une large part de tes verbes est remplie." },
  { n: 880, label: "Chevronné", blurb: "Verbes irréguliers et de mouvement avancés." },
  { n: 1600, label: "Expert", blurb: "Alternances de radical et exceptions incluses." },
  { n: 2900, label: "Virtuose", blurb: "Couverture très étendue des paradigmes verbaux." },
  { n: 5400, label: "Maître", blurb: "L’essentiel des formes conjuguées est rempli." },
  { n: 10000, label: "Grand maître", blurb: "Couverture quasi exhaustive." },
  { n: 18000, label: "Complet", blurb: "Tous tes paradigmes verbaux ou presque." },
];

// Vocabulary milestones — number of distinct lemmas known. Thresholds reflect real Russian
// vocabulary sizes (used by the dashboard "Vocabulaire" card and its control test).
export const VOCAB_MILESTONES: Milestone[] = [
  { n: 25, label: "Éveil", blurb: "Tes tout premiers mots." },
  { n: 50, label: "Premiers pas", blurb: "Mots et expressions de base." },
  { n: 100, label: "Survie", blurb: "De quoi te débrouiller." },
  { n: 250, label: "Bases solides", blurb: "Sujets familiers du quotidien." },
  { n: 500, label: "Conversation", blurb: "Échanges simples courants." },
  { n: 1000, label: "Quotidien", blurb: "À l’aise sur la vie de tous les jours." },
  { n: 2000, label: "Lecture courante", blurb: "Couvre l’essentiel des textes courants." },
  { n: 3000, label: "Lecture aisée", blurb: "Journaux et conversations sans bloquer." },
  { n: 5000, label: "Vocabulaire actif", blurb: "Bas de la fourchette d’un adulte russophone." },
  { n: 10000, label: "Niveau adulte", blurb: "Vocabulaire actif d’un adulte russophone." },
  { n: 20000, label: "Érudit", blurb: "Vers le vocabulaire passif." },
  { n: 40000, label: "Natif", blurb: "Vocabulaire passif d’un adulte." },
];

export function milestonesFor(track: LevelTrack): Milestone[] {
  if (track === "declension") return DECLENSION_MILESTONES;
  if (track === "conjugation") return CONJUGATION_MILESTONES;
  return VOCAB_MILESTONES;
}

/** Highest milestone index *reached* by the given count of filled forms (-1 = none). */
export function reachedLevelIndex(milestones: Milestone[], filled: number): number {
  return milestones.reduce((acc, m, i) => (filled >= m.n ? i : acc), -1);
}

/** Control-test size for a target level: grows from 8 (first tiers) to 20 (last). */
export function testSizeForLevel(levelIndex: number): number {
  const last = DECLENSION_MILESTONES.length - 1; // 11
  const t = Math.max(0, Math.min(last, levelIndex)) / last;
  return Math.round(8 + (20 - 8) * t);
}

export const PASS_RATIO = 1;

/** Correct answers needed to pass a control: 100% (every question right). */
export function neededCorrect(size: number): number {
  return size;
}
