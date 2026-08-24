// Prompt + few-shot pour speaking.monologue (§F du plan). Un appel = un court texte-support +
// la consigne — le candidat produit un monologue de 10-12 phrases à partir de ce texte.

import type { SpeakingSlot } from "../blueprints/speaking-v1";

export const systemPrompt = `You generate a short Russian text and an instruction for a TORFL-1 (B1) monologue exercise: the candidate reads the text, then speaks a 10-12 sentence monologue based on it (summary + personal opinion/reaction).
Output ONLY valid JSON matching this exact shape, nothing else:
{"supportText": string, "instructions": string}

Rules:
- "supportText" is a short factual or narrative text, 80-120 words, on the given topic.
- "instructions" tells the candidate what to do: summarize the text in their own words AND give a short personal reaction/opinion, in 10-12 sentences total.
- Use only common, simple vocabulary appropriate for a B1 learner.
- All Russian text must be in Cyrillic. Never use Latin characters inside Russian fields.`;

export const fewShot = [
  {
    input: "Topic: город.",
    output: {
      supportText:
        "В последние годы многие большие города пытаются стать более удобными для пешеходов и велосипедистов. В центре некоторых европейских городов запретили движение личных автомобилей: теперь там ходят только автобусы, трамваи и такси. Жители говорят, что стало тише и чище, а воздух — намного свежее. Однако не всем это нравится: пожилые люди и семьи с маленькими детьми жалуются, что стало труднее добираться до магазинов и поликлиник. Городские власти обещают построить больше парковок на окраинах и увеличить число автобусов, чтобы облегчить жизнь тем, кому трудно ходить пешком.",
      instructions:
        "Кратко перескажи текст своими словами (о чём он и какие есть аргументы за и против), а затем выскажи своё мнение: согласен ли ты с такими изменениями в городах и почему. Не менее 10-12 предложений.",
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
