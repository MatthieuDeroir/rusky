// Pools de cibles distinctes par typeId de lexgram (§B du plan). Un pool fournit, pour un
// typeId donné, la liste des cibles possibles (verbe, préposition, couple aspectuel...) parmi
// lesquelles le blueprint tire sans remise. Chaque fonction ci-dessous porte le nom du typeId
// qu'elle sert. N'ajouter un typeId ici que dans l'ordre du tableau §4.1 du spec (§Ordre de
// construction du plan) — jamais tous en une fois.

import { VERB_CASES } from "../../sentence";
import { CASE_ORDER, caseTriggers, explainTrigger, CASE_USAGE } from "../../cases";
import type { CaseCode } from "../../grammar";
import type { DistractorClass } from "../types";

export interface LexgramTarget {
  targetId: string;
  /** Contexte injecté dans le prompt de génération : verbe/préposition + explication FR. */
  hint: string;
  correctCase: CaseCode;
  distractorClasses: DistractorClass[];
}

/** lexgram.case-government-verb — rection verbale (aide/mémoire/oublie qui régit quel cas). */
export function caseGovernmentVerbTargets(): LexgramTarget[] {
  return Object.entries(VERB_CASES).map(([verb, correctCase]) => ({
    targetId: `${correctCase}-after-${verb}`,
    hint: `Le verbe « ${verb} » se construit avec ${
      { nom: "le nominatif", acc: "l'accusatif", gen: "le génitif", dat: "le datif", inst: "l'instrumental", prep: "le prépositionnel" }[
        correctCase
      ]
    }.`,
    correctCase,
    distractorClasses: ["wrong-case"],
  }));
}

/** lexgram.case-preposition — préposition + cas (y compris в/на acc vs prép). */
export function casePrepositionTargets(): LexgramTarget[] {
  return caseTriggers()
    .filter((t) => t.kind === "préposition")
    .map((t) => ({
      targetId: `prep-${t.trigger}`,
      hint: explainTrigger(t),
      // Pour une préposition multi-cas, on retient le premier cas listé comme cas "à tester" —
      // le prompt demande explicitement un contexte qui désambiguïse (ex. mouvement vs position).
      correctCase: t.cases[0],
      distractorClasses: ["wrong-case"],
    }));
}

/** Cas grammaticaux dans un ordre stable, pour construire les distracteurs "wrong-case". */
export function otherCases(correct: CaseCode): CaseCode[] {
  return CASE_ORDER.filter((c) => c !== correct);
}

export { CASE_USAGE };
