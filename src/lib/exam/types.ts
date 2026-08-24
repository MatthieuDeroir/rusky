// Formes TS des colonnes JSON-en-String de TrkiBankItem/TrkiItem/TrkiResponse (§A.2 du plan).
// Les colonnes Prisma restent `String` (convention du reste du schéma) — ces types documentent
// ce qu'on y stocke réellement et sont la seule source de vérité sur leur forme.

import type { SubtestCode } from "./config";

export type DistractorClass =
  | "wrong-case"
  | "wrong-aspect"
  | "wrong-prefix"
  | "wrong-number"
  | "wrong-gender-agree"
  | "wrong-government"
  | "wrong-conjugation";

/** Une option de QCM, taguée par sa classe pour permettre le KPI par classe d'erreur (§I). */
export interface LexgramOption {
  text: string;
  class: DistractorClass | "correct";
}

export interface LexgramPayload {
  stem: string;
  options: LexgramOption[];
}

export interface LexgramAnswerKey {
  correctIndex: number;
}

export interface ReadingListeningPayload {
  stem: string;
  options: string[];
}

export interface ReadingListeningAnswerKey {
  correctIndex: number;
}

export interface WritingSpeakingPayload {
  instructions: string;
  supportText?: string;
  intentions?: string[];
}

/** Sortie du rater (M3/M5) pour un item de production libre, stockée dans TrkiResponse.feedback. */
export interface RaterFeedback {
  scores: Record<string, number>; // par critère de grille (grammar, lexis, ...)
  errors: { span: string; type: string; correction: string; explanationFr: string }[];
  comment?: string;
}

export interface Slot {
  subtest: SubtestCode;
  typeId: string;
  targetId: string;
  topic: string;
  distractorClasses?: DistractorClass[];
}
