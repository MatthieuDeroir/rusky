// Prompt + few-shot pour lexgram.case-government-verb (§B du plan). Un appel = un item.

import type { LexgramSlot } from "../blueprints/lexgram-v1";
import { otherCases } from "../blueprints/lexgram-v1";

export const systemPrompt = `You generate a single Russian-as-a-foreign-language exam item for TORFL-1 (B1).
Output ONLY valid JSON matching this exact shape, nothing else:
{"stem": string, "options": [{"text": string, "class": string}, {"text": string, "class": string}, {"text": string, "class": string}, {"text": string, "class": string}]}

Rules:
- "stem" is a natural Russian sentence (8-16 words) with exactly one blank written as "___", built around the given verb and its required case.
- Exactly one option has "class": "correct" — the grammatically required case form of the given noun.
- The other three options have "class": "wrong-case" — the SAME noun declined in three OTHER real Russian cases (real forms, never invented spellings).
- All Russian text must be in Cyrillic. Never use Latin characters inside Russian fields.
- Do not reveal which option is correct anywhere in "stem".
- Use only common, simple vocabulary appropriate for a B1 learner.`;

export const fewShot = [
  {
    input: `Verb: помогать (requires dative). Noun to decline: друг. Correct case: dat. Topic: семья.`,
    output: {
      stem: "Настоящий друг всегда помогает ___ в трудную минуту.",
      options: [
        { text: "другу", class: "correct" },
        { text: "друга", class: "wrong-case" },
        { text: "другом", class: "wrong-case" },
        { text: "друге", class: "wrong-case" },
      ],
    },
  },
  {
    input: `Verb: бояться (requires genitive). Noun to decline: собака. Correct case: gen. Topic: быт.`,
    output: {
      stem: "Многие маленькие дети боятся ___, даже если она не кусается.",
      options: [
        { text: "собаки", class: "correct" },
        { text: "собаку", class: "wrong-case" },
        { text: "собакой", class: "wrong-case" },
        { text: "собаке", class: "wrong-case" },
      ],
    },
  },
];

const CASE_EN: Record<string, string> = {
  nom: "nominative",
  acc: "accusative",
  gen: "genitive",
  dat: "dative",
  inst: "instrumental",
  prep: "prepositional",
};

export function buildUserPrompt(slot: LexgramSlot, rejectionReason?: string): string {
  const verb = slot.targetId.replace(/^[a-z]+-after-/, "");
  const examples = fewShot
    .map((ex, i) => `EXAMPLE ${i + 1}:\nInput: ${ex.input}\nOutput: ${JSON.stringify(ex.output)}`)
    .join("\n\n");
  const otherCasesList = otherCases(slot.correctCase).map((c) => CASE_EN[c]).join(", ");
  const retryNote = rejectionReason
    ? `\n\nYour previous attempt was rejected for this reason: ${rejectionReason} Fix this and try again.`
    : "";

  return `${examples}

NOW GENERATE:
Input: ${slot.hint} Correct case: ${CASE_EN[slot.correctCase]}. Other real Russian cases to use for the three wrong-case distractors (pick any noun that plausibly fits the verb "${verb}"): ${otherCasesList}. Topic: ${slot.topic}.${retryNote}
Output:`;
}
