// Répétition espacée du Lecteur (SM-2 de src/lib/srs.ts) sur deux sortes de cartes :
// - "w:<encounterId>" : un mot gardé en lisant, revu DANS sa phrase d'origine ;
// - "q:<textId>:<questionId>" : une question de structure déjà rencontrée.
import { prisma } from "@/lib/db";
import { describeFormKey, displayAccent, WORD_TYPE_LABELS, type WordType } from "@/lib/grammar";
import { review as srsReview, nextDueDate, INITIAL_STATE, type Rating, type SrsState } from "@/lib/srs";
import type { ReaderAnalysis, ReaderQuestion } from "./types";

export const wordKey = (encounterId: number) => `w:${encounterId}`;
export const questionKey = (textId: number, qid: string) => `q:${textId}:${qid}`;

/** Première rencontre : la carte entre dans la file, déjà notée par ce qui vient de se passer. */
export async function seedReview(userId: string, key: string, rating: Rating) {
  const existing = await prisma.readerReview.findUnique({ where: { userId_key: { userId, key } } });
  if (existing) return;
  const now = new Date();
  const state = srsReview(INITIAL_STATE, rating);
  await prisma.readerReview.create({
    data: { userId, key, ...state, dueAt: nextDueDate(state, now), lastReviewedAt: now },
  });
}

export async function rateReview(userId: string, key: string, rating: Rating) {
  const row = await prisma.readerReview.findUnique({ where: { userId_key: { userId, key } } });
  if (!row) return;
  const now = new Date();
  const state: SrsState = srsReview(row, rating);
  await prisma.readerReview.update({
    where: { userId_key: { userId, key } },
    data: { ...state, dueAt: nextDueDate(state, now), lastReviewedAt: now },
  });
}

export interface WordCard {
  kind: "word";
  key: string;
  raw: string;
  sentence: string;
  entryId: number;
  lemma: string;
  typeLabel: string;
  formLabel: string;
  fr: string | null;
}

export interface QuestionCard {
  kind: "question";
  key: string;
  textId: number;
  title: string;
  /** Le paragraphe sur lequel porte la question. */
  passage: string;
  question: ReaderQuestion;
}

export type ReviewCard = WordCard | QuestionCard;

export async function dueReviewCount(userId: string): Promise<number> {
  return prisma.readerReview.count({ where: { userId, dueAt: { lte: new Date() } } });
}

/** Cartes dues, les plus en retard d'abord. Les cartes dont la source a disparu sont sautées. */
export async function dueReviews(userId: string, limit: number): Promise<ReviewCard[]> {
  const rows = await prisma.readerReview.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit * 2,
  });
  const encIds = rows.filter((r) => r.key.startsWith("w:")).map((r) => Number(r.key.slice(2)));
  const textIds = [...new Set(rows.filter((r) => r.key.startsWith("q:")).map((r) => Number(r.key.split(":")[1])))];
  const [encounters, texts] = await Promise.all([
    encIds.length
      ? prisma.encounter.findMany({ where: { id: { in: encIds }, userId }, include: { entry: true } })
      : Promise.resolve([]),
    textIds.length
      ? prisma.readingText.findMany({ where: { id: { in: textIds } }, select: { id: true, title: true, analysis: true } })
      : Promise.resolve([]),
  ]);
  const encById = new Map(encounters.map((e) => [e.id, e]));
  const textById = new Map(texts.map((t) => [t.id, t]));

  const cards: ReviewCard[] = [];
  for (const r of rows) {
    if (cards.length >= limit) break;
    if (r.key.startsWith("w:")) {
      const e = encById.get(Number(r.key.slice(2)));
      if (!e?.entry || !e.context) continue;
      cards.push({
        kind: "word",
        key: r.key,
        raw: e.rawInput,
        sentence: e.context,
        entryId: e.entry.id,
        lemma: displayAccent(e.entry.accented),
        typeLabel: WORD_TYPE_LABELS[e.entry.type as WordType] ?? e.entry.type,
        formLabel: e.matchedFormKey ? describeFormKey(e.matchedFormKey) : "Forme du dictionnaire",
        fr: e.entry.translationsFr,
      });
    } else {
      const [, tid, qid] = r.key.split(":");
      const t = textById.get(Number(tid));
      const a = t?.analysis ? (JSON.parse(t.analysis) as ReaderAnalysis) : null;
      const para = a?.paragraphs.find((p) => p.questions.some((q) => q.id === qid));
      const question = para?.questions.find((q) => q.id === qid);
      if (!t || !para || !question) continue;
      cards.push({ kind: "question", key: r.key, textId: t.id, title: t.title, passage: para.text, question });
    }
  }
  return cards;
}
