// Configuration chiffrée de l'examen blanc ТРКИ-1 (objectif B1). Toute valeur numérique du
// module vit ici — jamais en dur ailleurs. Voir /home/mderoir/.claude/plans/robust-yawning-plum.md
// et docs/adr/0006-bareme-officiel-trki1.md.
//
// Barème officiel : Типовые тесты по русскому языку как иностранному, первый сертификационный
// уровень (Zlatoust). Les valeurs de maxPoints de la première version de ce fichier étaient des
// estimations non sourcées (reading/listening notés à tort 1 pt/item au lieu de 7/4) — corrigées
// ici, ne jamais revenir aux anciennes valeurs (20/30/65/100/380).

export type SubtestCode = "lexgram" | "reading" | "listening" | "writing" | "speaking";

export const SUBTEST_ORDER: SubtestCode[] = ["lexgram", "reading", "writing", "listening", "speaking"];

export const SUBTEST_LABELS: Record<SubtestCode, string> = {
  lexgram: "Лексика · Грамматика",
  reading: "Чтение",
  listening: "Аудирование",
  writing: "Письмо",
  speaking: "Говорение",
};

interface SubtestConfig {
  maxPoints: number;
  pass66: number; // seuil de réussite individuel (66 %)
  pass60: number; // plancher toléré (60 %) — sous ce seuil, échec sans compensation possible
  durationMin: number;
  items?: number;
  pointsPerItem?: number; // QCM uniquement (lexgram/reading/listening) — writing/speaking sont notés par grille, pas par item
  texts?: number;
  tasks?: number;
  speechRate?: number;
  prepMin?: number;
}

export const TRKI1_CONFIG = {
  subtests: {
    lexgram: { items: 165, pointsPerItem: 1, maxPoints: 165, pass66: 109, pass60: 99, durationMin: 60 },
    reading: { items: 20, pointsPerItem: 7, maxPoints: 140, pass66: 92, pass60: 84, durationMin: 50, texts: 3 },
    listening: {
      items: 30,
      pointsPerItem: 4,
      maxPoints: 120,
      pass66: 79,
      pass60: 72,
      durationMin: 35,
      speechRate: 0.9,
    },
    writing: { tasks: 2, maxPoints: 80, pass66: 53, pass60: 48, durationMin: 60 },
    speaking: { tasks: 4, maxPoints: 170, pass66: 112, pass60: 102, durationMin: 50, prepMin: 25 },
  } satisfies Record<SubtestCode, SubtestConfig>,

  // Poids réels par sous-test (points/675) — говорение est le plus lourd de l'examen, pas
  // лексика-грамматика. Toute logique de priorisation/recommandation doit s'aligner là-dessus.
  total: {
    maxPoints: 675, // 165 + 140 + 120 + 80 + 170
    pass: 446, // seuil global — atteindre pass66 sur les 5 sous-tests ne suffit pas seul (445 < 446)
  },

  passing: {
    threshold: 0.66,
    toleranceFloor: 0.6,
    toleranceSlots: 1,
  },

  bankingYears: 2,
} as const;

export interface SubtestOutcome {
  subtest: SubtestCode;
  score: number; // points bruts, PAS un ratio
}

export interface PassResult {
  passed: boolean;
  perSubtestOk: boolean; // condition (a) : règle des seuils par sous-test
  totalOk: boolean; // condition (b) : somme ≥ 446
  totalScore: number;
  toleranceUsedBy: SubtestCode | null; // quel sous-test consomme le "slot" de tolérance, s'il y en a un
  failedBelow60: SubtestCode[]; // sous-tests < pass60, échec sans compensation possible
}

/**
 * Règle de réussite officielle : DEUX conditions cumulatives (ET).
 * (a) ∀ s : score(s) ≥ pass66(s)  ∨  ∃! s₀ : pass60(s₀) ≤ score(s₀) < pass66(s₀) ∧ ∀ s≠s₀ : score(s) ≥ pass66(s)
 * (b) somme des scores ≥ 446
 * Tout sous-test < pass60 ⇒ échec de la tentative entière, sans compensation possible.
 * Note : (a) seule n'implique PAS (b) — au seuil pile, la somme des pass66 vaut 445 < 446.
 */
export function isPassed(outcomes: SubtestOutcome[]): PassResult {
  const totalScore = outcomes.reduce((sum, o) => sum + o.score, 0);
  const totalOk = totalScore >= TRKI1_CONFIG.total.pass;

  const failedBelow60: SubtestCode[] = [];
  const inTolerance: SubtestCode[] = [];
  for (const o of outcomes) {
    const cfg = TRKI1_CONFIG.subtests[o.subtest];
    if (o.score < cfg.pass60) failedBelow60.push(o.subtest);
    else if (o.score < cfg.pass66) inTolerance.push(o.subtest);
  }

  const perSubtestOk =
    failedBelow60.length === 0 && inTolerance.length <= TRKI1_CONFIG.passing.toleranceSlots;

  return {
    passed: perSubtestOk && totalOk,
    perSubtestOk,
    totalOk,
    totalScore,
    toleranceUsedBy: inTolerance[0] ?? null,
    failedBelow60,
  };
}
