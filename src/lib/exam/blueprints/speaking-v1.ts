// Blueprint déterministe du sous-test speaking (§F du plan, M2 — remonté après M1 suite au
// correctif barème, docs/adr/0006). 4 typeId à item unique (contrairement à lexgram, pas de pool
// de cibles grammaticales à tirer sans remise — chaque tâche est un slot fixe, seul le thème
// tourne). Chronométrage (prepSec/responseSec) : le spec ne détaille pas les temps officiels par
// tâche, seulement le budget global (25 min prépa / 50 min total, config.ts) — répartition ici
// une estimation raisonnable documentée, à ajuster si les chiffres officiels sont trouvés.
//
// Barème par tâche (§A.2, Slot.points) : les 4 tâches ne pèsent pas le même poids (dialogue réactif
// et dialogue d'initiative sont plus courts que le dialogue suivi et le monologue) — pas de
// pointsPerItem uniforme possible comme pour lexgram. 42+42+43+43 = 170 (maxPoints officiel,
// docs/adr/0006), répartition égale par défaut faute de barème officiel détaillé par tâche.

import { makeRng } from "../rng";
import type { Slot } from "../types";
import { TOPICS } from "./lexgram-v1";

export const SPEAKING_BLUEPRINT_VERSION = "trki1-speaking-v1";

interface SpeakingTypeSpec {
  typeId: string;
  points: number;
  prepSec: number;
  responseSec: number;
  /** Nombre de répliques/situations à produire dans le même item (reactive/initiative-dialogue) —
   * absent pour un item à consigne unique (situational-dialogue, monologue). */
  stimuliCount?: number;
}

const REGISTRY: SpeakingTypeSpec[] = [
  { typeId: "speaking.reactive-dialogue", points: 42, stimuliCount: 5, prepSec: 30, responseSec: 25 },
  { typeId: "speaking.initiative-dialogue", points: 42, stimuliCount: 5, prepSec: 30, responseSec: 25 },
  { typeId: "speaking.situational-dialogue", points: 43, prepSec: 120, responseSec: 180 },
  { typeId: "speaking.monologue", points: 43, prepSec: 120, responseSec: 180 },
];

export interface SpeakingSlot extends Slot {
  subtest: "speaking";
  prepSec: number;
  responseSec: number;
  stimuliCount?: number;
}

/**
 * Construit les slots du sous-test speaking pour un seed donné. `typeIds` restreint aux typeId
 * demandés (passation indépendante d'une partie du sous-test, §H) — par défaut, les 4.
 */
export function buildSpeakingSlots(seed: string, typeIds?: string[]): SpeakingSlot[] {
  const rng = makeRng(seed);
  const specs = typeIds ? REGISTRY.filter((s) => typeIds.includes(s.typeId)) : REGISTRY;

  return specs.map((spec) => {
    const topic = TOPICS[Math.floor(rng() * TOPICS.length)];
    return {
      subtest: "speaking" as const,
      typeId: spec.typeId,
      targetId: spec.typeId, // un seul item par typeId : le typeId identifie déjà la cible
      topic,
      points: spec.points,
      prepSec: spec.prepSec,
      responseSec: spec.responseSec,
      stimuliCount: spec.stimuliCount,
    };
  });
}

export const REGISTERED_SPEAKING_TYPE_IDS = REGISTRY.map((s) => s.typeId);

/** Chronométrage par typeId (déterministe, pas persisté sur TrkiItem) — la passation le relit
 * directement d'ici plutôt que de dupliquer prepSec/responseSec dans le payload généré. */
export const SPEAKING_TIMING: Record<string, { prepSec: number; responseSec: number }> = Object.fromEntries(
  REGISTRY.map((s) => [s.typeId, { prepSec: s.prepSec, responseSec: s.responseSec }]),
);
