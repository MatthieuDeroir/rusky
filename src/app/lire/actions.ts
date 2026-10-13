"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { addXp, type XpAward } from "@/lib/xp";
import { backupDatabase } from "@/lib/backup";
import { addEncounterAction } from "@/app/actions";
import { runAnalysis } from "@/lib/reader/analyze";
import { fillGeneratedText, type GeneratedPurpose } from "@/lib/reader/generate";
import { getUnitStates } from "@/lib/reader/progress";
import { questionKey, seedReview, wordKey } from "@/lib/reader/review";
import { splitParagraphs } from "@/lib/reader/segment";
import type { ReaderAnalysis, ReaderAnswer, ReadingStatus } from "@/lib/reader/types";

const MAX_CHARS = 6000;

/** Un texte est lisible par son auteur, ou par tous s'il vient du corpus (userId null). */
async function readableText(id: number, userId: string) {
  const text = await prisma.readingText.findUnique({ where: { id } });
  if (!text || (text.userId !== null && text.userId !== userId)) throw new Error("Texte introuvable");
  return text;
}

export async function createTextAction(input: { title: string; body: string }): Promise<{ id: number }> {
  const userId = await currentUserId();
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (!/[а-яё]/i.test(body)) throw new Error("Le texte ne contient pas de russe.");
  if (body.length > MAX_CHARS) throw new Error(`Texte trop long (${body.length} caractères, max ${MAX_CHARS}).`);
  const firstLine = splitParagraphs(body)[0] ?? "";
  const title = input.title.trim() || (firstLine.length > 48 ? `${firstLine.slice(0, 45)}…` : firstLine);
  const text = await prisma.readingText.create({
    data: { userId, source: "pasted", title, body },
  });
  after(() => runAnalysis(text.id));
  revalidatePath("/lire");
  return { id: text.id };
}

export interface TextState {
  title: string;
  status: ReadingStatus;
  analysis: ReaderAnalysis | null;
  error: string | null;
}

/** Sondé par le lecteur pendant l'analyse (les paragraphes arrivent au fil de l'eau). */
export async function getTextStateAction(id: number): Promise<TextState> {
  const userId = await currentUserId();
  const text = await readableText(id, userId);
  return {
    title: text.title,
    status: text.status as ReadingStatus,
    analysis: text.analysis ? (JSON.parse(text.analysis) as ReaderAnalysis) : null,
    error: text.error,
  };
}

/** Relance l'analyse IA des paragraphes restés en analyse partielle (ou d'un texte en échec) —
 * ou la génération elle-même, pour un texte généré qui n'a jamais reçu de contenu. */
export async function retryAnalysisAction(id: number): Promise<void> {
  const userId = await currentUserId();
  const text = await readableText(id, userId);
  if (text.source === "generated" && !text.body) {
    const { level } = await getUnitStates(userId);
    await prisma.readingText.update({ where: { id }, data: { status: "GENERATING", error: null } });
    after(() =>
      fillGeneratedText(id, { purpose: (text.purpose ?? "daily") as GeneratedPurpose, unitId: text.unitId, level }),
    );
    return;
  }
  await prisma.readingText.update({ where: { id }, data: { status: "ANALYZING", error: null } });
  after(() => runAnalysis(text.id, { onlyFailed: true }));
}

export interface AnswerResult {
  correct: boolean;
  answer: number;
  xp?: XpAward;
}

export async function answerQuestionAction(textId: number, questionId: string, choice: number): Promise<AnswerResult> {
  const userId = await currentUserId();
  const text = await readableText(textId, userId);
  const analysis = JSON.parse(text.analysis ?? "null") as ReaderAnalysis | null;
  const q = analysis?.paragraphs.flatMap((p) => p.questions).find((x) => x.id === questionId);
  if (!q) throw new Error("Question introuvable");
  const correct = choice === q.answer;

  const progress = await prisma.readingProgress.findUnique({ where: { userId_textId: { userId, textId } } });
  const answers = JSON.parse(progress?.answers ?? "{}") as Record<string, ReaderAnswer>;
  const firstTry = !(questionId in answers);
  // On garde la PREMIÈRE réponse : c'est elle qui mesure la lecture, pas le second essai.
  if (firstTry) {
    answers[questionId] = { choice, correct };
    await prisma.readingProgress.upsert({
      where: { userId_textId: { userId, textId } },
      create: { userId, textId, answers: JSON.stringify(answers) },
      update: { answers: JSON.stringify(answers) },
    });
  }
  // La question rejoint la file de révision : ratée, elle revient vite ; réussie, plus tard.
  if (firstTry) await seedReview(userId, questionKey(textId, questionId), correct ? "good" : "again");
  const xp = firstTry && correct ? await addXp(userId, "structure") : undefined;
  return { correct, answer: q.answer, xp };
}

export async function completeTextAction(textId: number): Promise<{ xp?: XpAward }> {
  const userId = await currentUserId();
  await readableText(textId, userId);
  const progress = await prisma.readingProgress.findUnique({ where: { userId_textId: { userId, textId } } });
  if (progress?.completedAt) return {};
  await prisma.readingProgress.upsert({
    where: { userId_textId: { userId, textId } },
    create: { userId, textId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
  const xp = await addXp(userId, "reading");
  revalidatePath("/lire");
  return { xp };
}

/** « Garder ce mot » : même mécanique que Ajouter un mot, avec la phrase comme contexte. */
export async function keepWordAction(input: {
  textId: number;
  entryId: number;
  formKey: string | null;
  raw: string;
  sentence: string;
}) {
  const userId = await currentUserId();
  const text = await readableText(input.textId, userId);
  const res = await addEncounterAction({
    entryId: input.entryId,
    rawInput: input.raw,
    matchedFormKey: input.formKey,
    source: `Lecteur — ${text.title}`,
    context: input.sentence,
  });
  // Revu dans sa phrase dès demain (Révision éclair du quotidien).
  await seedReview(userId, wordKey(res.id), "good");
  return res;
}

export async function deleteTextAction(id: number): Promise<void> {
  const userId = await currentUserId();
  const text = await readableText(id, userId);
  if (text.userId !== userId) throw new Error("Seuls tes propres textes peuvent être supprimés.");
  await backupDatabase();
  await prisma.readingText.delete({ where: { id } });
  revalidatePath("/lire");
}
