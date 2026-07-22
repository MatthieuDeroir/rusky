/** SM-2 simplifié à 3 boutons. Fonctions pures, testables. */

export type Rating = "again" | "good" | "easy";

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
