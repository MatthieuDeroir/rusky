// Smoke test ponctuel (pas dans package.json) : génère + valide les 4 typeId speaking en
// appelant réellement Mistral, pour prouver le moteur (génération + 4 passes) hors de
// l'orchestration createPaper()/after() (qui a besoin d'un contexte de requête Next.js).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { generateSpeakingItem } from "../src/lib/mistral";
import { buildSpeakingSlots } from "../src/lib/exam/blueprints/speaking-v1";
import { validateSpeakingItem } from "../src/lib/exam/validate-speaking";
import * as reactive from "../src/lib/exam/prompts/speaking.reactive-dialogue";
import * as initiative from "../src/lib/exam/prompts/speaking.initiative-dialogue";
import * as situational from "../src/lib/exam/prompts/speaking.situational-dialogue";
import * as monologue from "../src/lib/exam/prompts/speaking.monologue";
import type { SpeakingSlot } from "../src/lib/exam/blueprints/speaking-v1";

interface PromptModule {
  systemPrompt: string;
  buildUserPrompt: (slot: SpeakingSlot, rejectionReason?: string) => string;
}

const PROMPTS: Record<string, PromptModule> = {
  "speaking.reactive-dialogue": reactive,
  "speaking.initiative-dialogue": initiative,
  "speaking.situational-dialogue": situational,
  "speaking.monologue": monologue,
};

async function main() {
  const slots = buildSpeakingSlots("smoke-test-speaking-seed");
  console.log(`[smoke-test] ${slots.length} slots à générer\n`);

  for (const slot of slots) {
    console.log(`--- ${slot.typeId} (topic: ${slot.topic}, points: ${slot.points}) ---`);
    const promptModule = PROMPTS[slot.typeId];
    const userPrompt = promptModule.buildUserPrompt(slot);
    let raw: unknown;
    try {
      raw = await generateSpeakingItem(promptModule.systemPrompt, userPrompt);
    } catch (e) {
      console.log(`GÉNÉRATION ÉCHOUÉE: ${e instanceof Error ? e.message : e}\n`);
      continue;
    }
    console.log("Brut:", JSON.stringify(raw));
    const result = await validateSpeakingItem(raw, slot);
    for (const step of result.steps) {
      console.log(`  passe ${step.pass} (${step.name}): ${step.ok ? "OK" : "REJET — " + step.detail}`);
    }
    console.log(`  => ${result.ok ? "VALIDE" : "REJETÉ"}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
