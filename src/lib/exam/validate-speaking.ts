// Validation des items speaking (§F du plan) — plus légère que lexgram : pas de "bonne réponse"
// à vérifier (production libre, notée par le rater à la réponse, pas à la génération), donc pas
// de passe de contre-résolution. 4 passes : schéma, alphabet, structure, lexique.

import { z } from "zod";
import type { SpeakingSlot } from "./blueprints/speaking-v1";
import type { WritingSpeakingPayload } from "./types";
import type { ValidationStep } from "./validate";
import { outOfScopeWords } from "./validate";

const LATIN_RE = /[a-zA-Z]/;

const StimuliSchema = z.object({ stimuli: z.array(z.string().trim().min(3)).min(3).max(8) });
const InstructionsSchema = z.object({ instructions: z.string().trim().min(5) });
const MonologueSchema = z.object({
  supportText: z.string().trim().min(20),
  instructions: z.string().trim().min(5),
});
const SpeakingItemSchema = z.union([StimuliSchema, MonologueSchema, InstructionsSchema]);

export interface SpeakingValidationResult {
  ok: boolean;
  steps: ValidationStep[];
  payload?: WritingSpeakingPayload;
}

export async function validateSpeakingItem(
  raw: unknown,
  slot: SpeakingSlot,
  userId?: string,
): Promise<SpeakingValidationResult> {
  const steps: ValidationStep[] = [];

  const parsed = SpeakingItemSchema.safeParse(raw);
  steps.push({
    pass: 1,
    name: "schéma",
    ok: parsed.success,
    detail: parsed.success ? undefined : parsed.error.issues.map((i) => i.message).join("; "),
  });
  if (!parsed.success) return { ok: false, steps };
  const item = parsed.data;

  const allText = [
    "instructions" in item ? item.instructions : "",
    "supportText" in item ? item.supportText : "",
    "stimuli" in item ? item.stimuli.join(" ") : "",
  ].join(" ");
  const alphabetOk = !LATIN_RE.test(allText);
  steps.push({
    pass: 2,
    name: "alphabet",
    ok: alphabetOk,
    detail: alphabetOk ? undefined : "caractères latins détectés",
  });
  if (!alphabetOk) return { ok: false, steps };

  // Structure attendue selon le typeId : le bon nombre de stimuli pour reactive/initiative-
  // dialogue, un texte-support d'une longueur plausible pour monologue.
  let structureOk = true;
  let structureDetail: string | undefined;
  if (slot.stimuliCount !== undefined) {
    if (!("stimuli" in item) || item.stimuli.length !== slot.stimuliCount) {
      structureOk = false;
      structureDetail = `attendu ${slot.stimuliCount} stimuli, reçu ${"stimuli" in item ? item.stimuli.length : 0}`;
    }
  } else if (slot.typeId === "speaking.monologue") {
    const wordCount = "supportText" in item ? item.supportText.trim().split(/\s+/).length : 0;
    if (wordCount < 50 || wordCount > 200) {
      structureOk = false;
      structureDetail = `texte-support de ${wordCount} mots, attendu 50-200`;
    }
  } else if (!("instructions" in item) || item.instructions.trim().split(/\s+/).length < 6) {
    structureOk = false;
    structureDetail = "consigne trop courte pour un dialogue suivi";
  }
  steps.push({ pass: 3, name: "structure", ok: structureOk, detail: structureDetail });
  if (!structureOk) return { ok: false, steps };

  // Tolérance proportionnelle à la longueur du texte (contrairement au lexgram, un item speaking
  // peut faire plusieurs dizaines de mots — un budget fixe de 1 mot serait bien trop strict).
  const outOfScope = await outOfScopeWords(allText, userId);
  const wordCount = allText.trim().split(/\s+/).filter(Boolean).length;
  const tolerance = Math.max(2, Math.round(wordCount * 0.12));
  const lexiconOk = outOfScope.length <= tolerance;
  steps.push({
    pass: 4,
    name: "lexique",
    ok: lexiconOk,
    detail: lexiconOk ? undefined : `hors minimum B1 (${outOfScope.length}/${tolerance} tolérés) : ${outOfScope.slice(0, 8).join(", ")}`,
  });
  if (!lexiconOk) return { ok: false, steps };

  const stimuliInstructions =
    slot.typeId === "speaking.initiative-dialogue"
      ? "Pour chaque situation, prends l'initiative et commence la conversation."
      : "Réagis brièvement et naturellement à chaque réplique.";
  const payload: WritingSpeakingPayload = {
    instructions: "instructions" in item ? item.instructions : stimuliInstructions,
    supportText: "supportText" in item ? item.supportText : undefined,
    stimuli: "stimuli" in item ? item.stimuli : undefined,
  };
  return { ok: true, steps, payload };
}
