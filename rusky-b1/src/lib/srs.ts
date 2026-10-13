/** SM-2 simplifié. Fonctions pures, testables. */

export type Rating = "again" | "hard" | "good" | "easy";

export interface SrsState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export const INITIAL_STATE: SrsState = {
  ease: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
};

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 180;
/** Carte considérée maîtrisée à partir de cet intervalle (convention Anki). */
export const MASTERY_INTERVAL_DAYS = 21;

export function review(state: SrsState, rating: Rating): SrsState {
  if (rating === "again") {
    return {
      ease: Math.max(MIN_EASE, state.ease - 0.2),
      intervalDays: 0,
      repetitions: 0,
      lapses: state.lapses + 1,
    };
  }

  // "hard" = réponse acceptée mais imparfaite (le bon sens, le mauvais terme). Ni gain ni
  // perte de niveau : `repetitions` ne bouge pas. L'intervalle progresse à peine, donc la
  // carte revient vite pour retenter le terme exact.
  if (rating === "hard") {
    const intervalDays =
      state.repetitions === 0 ? 1 : Math.max(1, Math.round(state.intervalDays * 1.2));
    return {
      ease: Math.max(MIN_EASE, state.ease - 0.15),
      intervalDays: Math.min(MAX_INTERVAL_DAYS, intervalDays),
      repetitions: state.repetitions,
      lapses: state.lapses,
    };
  }

  if (rating === "good") {
    const intervalDays =
      state.repetitions === 0
        ? 1
        : state.repetitions === 1
          ? 3
          : Math.round(state.intervalDays * state.ease);
    return {
      ease: state.ease,
      intervalDays: Math.min(MAX_INTERVAL_DAYS, intervalDays),
      repetitions: state.repetitions + 1,
      lapses: state.lapses,
    };
  }

  // easy
  const raw =
    state.repetitions === 0
      ? 2
      : Math.max(state.intervalDays * state.ease * 1.3, state.intervalDays + 1);
  return {
    ease: Math.min(MAX_EASE, state.ease + 0.1),
    intervalDays: Math.min(MAX_INTERVAL_DAYS, Math.round(raw)),
    repetitions: state.repetitions + 1,
    lapses: state.lapses,
  };
}

export function nextDueDate(state: SrsState, now: Date): Date {
  if (state.intervalDays <= 0) return now;
  return new Date(now.getTime() + state.intervalDays * 24 * 60 * 60 * 1000);
}

// ---- Niveaux de compétence (ce que l'utilisateur voit, à la place d'une date) -----
//
// Le niveau d'une carte = son nombre de bonnes réponses consécutives (`repetitions`) :
// une bonne réponse fait monter d'un cran, une erreur ramène à 0, un « oui mais » laisse
// le niveau tel quel. L'intervalle de réapparition reste géré par SM-2, en coulisses.

export const LEVEL_LABELS = [
  "À apprendre", // 0
  "Fragile", // 1
  "En cours", // 2
  "Solide", // 3
  "Ancré", // 4
  "Maîtrisé", // 5
] as const;

/** Dernier palier nommé ; au-delà, la carte reste « Maîtrisé ». */
export const MAX_LEVEL = LEVEL_LABELS.length - 1;

export function levelOf(state: SrsState): number {
  return Math.min(MAX_LEVEL, state.repetitions);
}

export function levelLabel(level: number): string {
  return LEVEL_LABELS[Math.max(0, Math.min(MAX_LEVEL, level))];
}
