"use server";

// Server actions du hub Objectif B1 (§H/§M du plan). Fichier dédié plutôt qu'ajouté à
// src/app/actions.ts (déjà volumineux) — même conventions (currentUserId(), objets typés,
// revalidatePath seulement sur mutation).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { createPaper } from "@/lib/exam/generate";
import { isPassed, TRKI1_CONFIG, type PassResult, type SubtestCode } from "@/lib/exam/config";
import type { LexgramPayload } from "@/lib/exam/types";

export interface PaperStatus {
  paperId: number;
  status: string;
  error: string | null;
  subtests: SubtestCode[];
}

export async function createExamPaperAction(input: {
  subtests: SubtestCode[];
  purpose?: "EXAM" | "PRACTICE";
}): Promise<{ paperId: number }> {
  const userId = await currentUserId();
  const { paperId } = await createPaper({
    userId,
    subtests: input.subtests,
    purpose: input.purpose,
  });
  revalidatePath("/objectif-b1/examens");
  return { paperId };
}

export async function getPaperStatusAction(paperId: number): Promise<PaperStatus | null> {
  const userId = await currentUserId();
  const paper = await prisma.trkiPaper.findFirst({
    where: { id: paperId, userId },
    select: { id: true, status: true, error: true, subtests: true },
  });
  if (!paper) return null;
  return {
    paperId: paper.id,
    status: paper.status,
    error: paper.error,
    subtests: JSON.parse(paper.subtests) as SubtestCode[],
  };
}

export interface PaperListEntry {
  id: number;
  status: string;
  purpose: string;
  subtests: SubtestCode[];
  createdAt: string;
  itemCount: number;
}

export async function listPapersAction(): Promise<PaperListEntry[]> {
  const userId = await currentUserId();
  const papers = await prisma.trkiPaper.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      purpose: true,
      subtests: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });
  return papers.map((p) => ({
    id: p.id,
    status: p.status,
    purpose: p.purpose,
    subtests: JSON.parse(p.subtests) as SubtestCode[],
    createdAt: p.createdAt.toISOString(),
    itemCount: p._count.items,
  }));
}

/** Item sans la clé — c'est tout ce que le client doit voir pendant la passation. */
export interface PassationItem {
  id: number;
  position: number;
  typeId: string;
  stem: string;
  options: string[];
}

export interface PassationData {
  attemptId: number;
  subtest: SubtestCode;
  durationMin: number;
  items: PassationItem[];
}

export async function startAttemptAction(paperId: number, subtest: SubtestCode): Promise<PassationData | { error: string }> {
  const userId = await currentUserId();
  const paper = await prisma.trkiPaper.findFirst({ where: { id: paperId, userId, status: "READY" } });
  if (!paper) return { error: "Sujet introuvable ou pas encore prêt." };

  const attempt = await prisma.trkiAttempt.create({
    data: { userId, paperId, mode: "FULL" },
  });

  const { TRKI1_CONFIG } = await import("@/lib/exam/config");
  const items = await prisma.trkiItem.findMany({
    where: { paperId, subtest },
    orderBy: { position: "asc" },
  });

  return {
    attemptId: attempt.id,
    subtest,
    durationMin: TRKI1_CONFIG.subtests[subtest].durationMin,
    items: items.map((it) => {
      const payload = JSON.parse(it.payload) as LexgramPayload;
      return {
        id: it.id,
        position: it.position,
        typeId: it.typeId,
        stem: payload.stem,
        options: payload.options.map((o) => o.text),
      };
    }),
  };
}

export async function submitTrkiAnswerAction(
  attemptId: number,
  itemId: number,
  answerIndex: number,
): Promise<{ correct: boolean }> {
  const userId = await currentUserId();
  const attempt = await prisma.trkiAttempt.findFirst({ where: { id: attemptId, userId } });
  if (!attempt) throw new Error("Tentative introuvable.");
  const item = await prisma.trkiItem.findUniqueOrThrow({ where: { id: itemId } });
  const answerKey = JSON.parse(item.answerKey) as { correctIndex: number };
  const correct = answerIndex === answerKey.correctIndex;

  await prisma.trkiResponse.upsert({
    where: { attemptId_itemId: { attemptId, itemId } },
    update: { answer: JSON.stringify({ index: answerIndex }), correct },
    create: { attemptId, itemId, answer: JSON.stringify({ index: answerIndex }), correct },
  });

  return { correct };
}

export interface SubtestResultView {
  subtest: SubtestCode;
  rawScore: number;
  maxScore: number;
  ratio: number;
  passed: boolean;
}

export async function finishAttemptAction(
  attemptId: number,
): Promise<{ results: SubtestResultView[]; passResult: PassResult }> {
  const userId = await currentUserId();
  const attempt = await prisma.trkiAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { responses: { include: { item: true } } },
  });
  if (!attempt) throw new Error("Tentative introuvable.");

  // item.points porte déjà le barème officiel par sous-test (posé à la génération depuis
  // TRKI1_CONFIG.subtests[subtest].pointsPerItem, ex. 7 pts/item en lecture, 4 en écoute) — pas
  // besoin de le relire ici, juste de sommer.
  const bySubtest = new Map<SubtestCode, { raw: number; max: number }>();
  for (const r of attempt.responses) {
    const subtest = r.item.subtest as SubtestCode;
    const acc = bySubtest.get(subtest) ?? { raw: 0, max: 0 };
    acc.max += r.item.points;
    if (r.correct) acc.raw += r.item.points;
    bySubtest.set(subtest, acc);
  }

  const passResult = isPassed([...bySubtest].map(([subtest, { raw }]) => ({ subtest, score: raw })));

  const results: SubtestResultView[] = [];
  for (const [subtest, { raw, max }] of bySubtest) {
    const ratio = max > 0 ? raw / max : 0;
    const passed = raw >= TRKI1_CONFIG.subtests[subtest].pass66;
    await prisma.trkiSubtestResult.upsert({
      where: { attemptId_subtest: { attemptId, subtest } },
      update: { rawScore: raw, maxScore: max, ratio, passed },
      create: { attemptId, subtest, rawScore: raw, maxScore: max, ratio, passed },
    });
    results.push({ subtest, rawScore: raw, maxScore: max, ratio, passed });
  }

  await prisma.trkiAttempt.update({ where: { id: attemptId }, data: { submittedAt: new Date() } });
  revalidatePath("/objectif-b1/examens");
  return { results, passResult };
}

export interface ResultsData {
  results: SubtestResultView[];
  passResult: PassResult;
  perTarget: { targetId: string; typeId: string; correct: boolean; stem: string }[];
}

export async function getAttemptResultsAction(attemptId: number): Promise<ResultsData | null> {
  const userId = await currentUserId();
  const attempt = await prisma.trkiAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      results: true,
      responses: { include: { item: true } },
    },
  });
  if (!attempt) return null;

  const results: SubtestResultView[] = attempt.results.map((r) => ({
    subtest: r.subtest as SubtestCode,
    rawScore: r.rawScore,
    maxScore: r.maxScore,
    ratio: r.ratio,
    passed: r.passed,
  }));
  const passResult = isPassed(results.map((r) => ({ subtest: r.subtest, score: r.rawScore })));

  return {
    results,
    passResult,
    perTarget: attempt.responses.map((r) => ({
      targetId: r.item.targetId,
      typeId: r.item.typeId,
      correct: r.correct ?? false,
      stem: (JSON.parse(r.item.payload) as LexgramPayload).stem,
    })),
  };
}
