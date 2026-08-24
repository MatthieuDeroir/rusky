// Prompt + few-shot pour speaking.reactive-dialogue (§F du plan). Un appel = les 5 répliques
// de l'item (pas 5 appels séparés — elles doivent former un petit dialogue thématiquement cohérent).

import type { SpeakingSlot } from "../blueprints/speaking-v1";

export const systemPrompt = `You generate 5 short conversational lines (a Russian interlocutor's side of a dialogue) for a TORFL-1 (B1) oral reactive-dialogue exercise.
Output ONLY valid JSON matching this exact shape, nothing else:
{"stimuli": [string, string, string, string, string]}

Rules:
- Each line is something a Russian speaker might say to the candidate in everyday life (a question, a remark, an invitation, a complaint...), 6-14 words.
- The candidate must be able to react briefly and naturally to each — do not ask for information the candidate cannot plausibly know.
- All 5 lines should loosely fit the same everyday situation/topic, but each should call for a DIFFERENT kind of reaction (agreement, refusal, surprise, advice, a follow-up question...).
- Use only common, simple vocabulary appropriate for a B1 learner.
- All Russian text must be in Cyrillic. Never use Latin characters inside Russian fields.`;

export const fewShot = [
  {
    input: "Topic: покупки.",
    output: {
      stimuli: [
        "Извините, а у вас есть эта рубашка на размер больше?",
        "Мне кажется, это слишком дорого для такого качества.",
        "Вы не подскажете, где здесь примерочная?",
        "Если хотите, я могу показать вам похожую модель подешевле.",
        "Вы уже определились, что будете покупать?",
      ],
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
