// Prompt + few-shot pour speaking.situational-dialogue (§F du plan). Un appel = une consigne de
// dialogue suivi (jeu de rôle), pas de clé à valider — noté par le rater sur le transcript.

import type { SpeakingSlot } from "../blueprints/speaking-v1";

export const systemPrompt = `You generate ONE role-play instruction for a TORFL-1 (B1) sustained oral dialogue exercise (the candidate will play their side of a several-turn conversation, an examiner or partner plays the other side).
Output ONLY valid JSON matching this exact shape, nothing else:
{"instructions": string}

Rules:
- Describe an everyday situation (12-25 words) requiring a short back-and-forth exchange (not a single line) — booking something, resolving a small problem, negotiating a plan, asking for advice...
- Write it as an instruction to the candidate ("Ты..."/"Представь, что..."), specifying who the other person is and what the candidate needs to achieve.
- Use only common, simple vocabulary appropriate for a B1 learner.
- All Russian text must be in Cyrillic. Never use Latin characters inside Russian fields.`;

export const fewShot = [
  {
    input: "Topic: здоровье.",
    output: {
      instructions:
        "Представь, что ты записываешься на приём к врачу по телефону. Объясни, что у тебя болит, и договорись о дне и времени приёма.",
    },
  },
];

export function buildUserPrompt(slot: SpeakingSlot, rejectionReason?: string): string {
  const examples = fewShot
    .map((ex, i) => `EXAMPLE ${i + 1}:\nInput: ${ex.input}\nOutput: ${JSON.stringify(ex.output)}`)
    .join("\n\n");
  const retryNote = rejectionReason
    ? `\n\nYour previous attempt was rejected for this reason: ${rejectionReason} Fix this and try again.`
    : "";
  return `${examples}\n\nNOW GENERATE:\nTopic: ${slot.topic}.${retryNote}\nOutput:`;
}
