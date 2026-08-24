// Prompt + few-shot pour speaking.initiative-dialogue (§F du plan). Un appel = les 5 situations
// de l'item — le candidat doit initier la conversation dans chacune (pas réagir à une réplique).

import type { SpeakingSlot } from "../blueprints/speaking-v1";

export const systemPrompt = `You generate 5 short everyday situations for a TORFL-1 (B1) oral initiative-dialogue exercise.
Output ONLY valid JSON matching this exact shape, nothing else:
{"stimuli": [string, string, string, string, string]}

Rules:
- Each situation describes, from the candidate's point of view, a moment where THEY must start a conversation with someone (ask for something, complain, invite, introduce a topic...), 8-16 words.
- Write the situation as an instruction to the candidate (e.g. "Ты хочешь..."/"Позвони..."/"Обратись к..."), not as the other person's line.
- All 5 situations should loosely fit the same everyday topic, but call for different kinds of opening move (a request, a complaint, an invitation, small talk, asking for directions...).
- Use only common, simple vocabulary appropriate for a B1 learner.
- All Russian text must be in Cyrillic. Never use Latin characters inside Russian fields.`;

export const fewShot = [
  {
    input: "Topic: транспорт.",
    output: {
      stimuli: [
        "Ты не знаешь, какой автобус идёт до центра — спроси у прохожего.",
        "Ты опоздал на последний автобус — попроси таксиста подвезти тебя подешевле.",
        "Ты хочешь пожаловаться контролёру, что автобус постоянно опаздывает.",
        "Пригласи друга поехать вместе на выходные на поезде.",
        "Спроси у соседа по вагону, свободно ли место рядом с ним.",
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
