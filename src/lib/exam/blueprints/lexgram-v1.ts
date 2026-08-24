// Blueprint déterministe du sous-test lexgram (§B du plan) — code versionné, pas une table DB.
// N'ajouter un typeId au REGISTRY que dans l'ordre du tableau §4.1 du spec (§Ordre de
// construction), jamais tous en une fois. Trois typeId sont prêts à être branchés dès que leur
// pool de cibles existe dans lexgram/targets.ts ; les 13 restants suivront un par un.

import { makeRng, sampleWithoutReplacement } from "../rng";
import type { Slot } from "../types";
import { caseGovernmentVerbTargets, otherCases, type LexgramTarget } from "../lexgram/targets";

export const LEXGRAM_BLUEPRINT_VERSION = "trki1-lexgram-v1";

/** Domaines thématiques fermés (§8 du spec). */
export const TOPICS = [
  "быт",
  "учёба",
  "работа",
  "путешествие",
  "здоровье",
  "город",
  "семья",
  "свободное время",
  "погода",
  "покупки",
  "транспорт",
  "культура",
] as const;

interface TypeIdSpec {
  typeId: string;
  /** Nombre d'items visé par le tableau §4.1 du spec — plafonné à la taille réelle du pool. */
  targetCount: number;
  targets: () => LexgramTarget[];
}

const REGISTRY: TypeIdSpec[] = [
  { typeId: "lexgram.case-government-verb", targetCount: 20, targets: caseGovernmentVerbTargets },
];

export interface LexgramSlot extends Slot {
  subtest: "lexgram";
  correctCase: LexgramTarget["correctCase"];
  hint: string;
}

/**
 * Construit les slots du sous-test lexgram pour un seed donné. `typeIds` restreint aux typeId
 * demandés (passation indépendante d'une partie du sous-test, §H) — par défaut, tous ceux déjà
 * enregistrés dans REGISTRY (pas forcément les 16 du spec tant qu'ils n'ont pas été ajoutés un
 * par un).
 */
export function buildLexgramSlots(seed: string, typeIds?: string[]): LexgramSlot[] {
  const rng = makeRng(seed);
  const specs = typeIds ? REGISTRY.filter((s) => typeIds.includes(s.typeId)) : REGISTRY;

  const slots: LexgramSlot[] = [];
  for (const spec of specs) {
    const pool = spec.targets();
    const drawn = sampleWithoutReplacement(pool, spec.targetCount, rng);
    for (const target of drawn) {
      const topic = TOPICS[Math.floor(rng() * TOPICS.length)];
      slots.push({
        subtest: "lexgram",
        typeId: spec.typeId,
        targetId: target.targetId,
        topic,
        distractorClasses: target.distractorClasses,
        correctCase: target.correctCase,
        hint: target.hint,
      });
    }
  }
  return slots;
}

export { otherCases };
export const REGISTERED_TYPE_IDS = REGISTRY.map((s) => s.typeId);
