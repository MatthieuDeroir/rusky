// Smoke test ponctuel (pas dans package.json) : génère + valide 3 items lexgram.case-government-verb
// en appelant réellement Mistral, pour prouver le moteur (génération + 6 passes) hors de
// l'orchestration createPaper()/after() (qui a besoin d'un contexte de requête Next.js).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { generateLexgramItem } from "../src/lib/mistral";
import { buildLexgramSlots } from "../src/lib/exam/blueprints/lexgram-v1";
import { validateLexgramItem } from "../src/lib/exam/validate";
import * as promptModule from "../src/lib/exam/prompts/lexgram.case-government-verb";

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("Aucun utilisateur en base — impossible de tester le pool pokédex.");

  const slots = buildLexgramSlots("smoke-test-seed", ["lexgram.case-government-verb"]).slice(0, 3);
  console.log(`[smoke-test] ${slots.length} slots à générer\n`);

  for (const slot of slots) {
    console.log(`--- ${slot.targetId} (topic: ${slot.topic}) ---`);
    const userPrompt = promptModule.buildUserPrompt(slot);
    let raw: unknown;
    try {
      raw = await generateLexgramItem(promptModule.systemPrompt, userPrompt);
    } catch (e) {
      console.log(`GÉNÉRATION ÉCHOUÉE: ${e instanceof Error ? e.message : e}\n`);
      continue;
    }
    console.log("Brut:", JSON.stringify(raw));
    const result = await validateLexgramItem(raw, slot, user.id);
    for (const step of result.steps) {
      console.log(`  passe ${step.pass} (${step.name}): ${step.ok ? "OK" : "REJET — " + step.detail}`);
    }
    console.log(`  => ${result.ok ? "VALIDE" : result.quarantined ? "QUARANTAINE" : "REJETÉ"}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
