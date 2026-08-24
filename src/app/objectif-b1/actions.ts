"use server";

// Server actions du hub Objectif B1 (§H/§M du plan). Fichier dédié plutôt qu'ajouté à
// src/app/actions.ts (déjà volumineux) — même conventions (currentUserId(), objets typés,
// revalidatePath seulement sur mutation).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { addEncounterAction } from "@/app/actions";
import type { XpAward } from "@/lib/xp";
import { createPaper } from "@/lib/exam/generate";
import { isPassed, TRKI1_CONFIG, type PassResult, type SubtestCode } from "@/lib/exam/config";
import type { LexgramPayload, WritingSpeakingPayload, RaterFeedback } from "@/lib/exam/types";
import { SPEAKING_TIMING } from "@/lib/exam/blueprints/speaking-v1";
import { gradeSpeaking } from "@/lib/mistral";
import { getB1State, getDayEntryIds } from "@/lib/exam/b1-curriculum";
import { WORD_TYPE_LABELS, type WordType } from "@/lib/grammar";

export interface PaperStatus {
  paperId: number;
  status: string;
  error: string | null;
  subtests: SubtestCode[];
  totalSlots: number | null;
  resolvedSlots: number;
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
    select: { id: true, status: true, error: true, subtests: true, totalSlots: true, resolvedSlots: true },
  });
  if (!paper) return null;
  return {
    paperId: paper.id,
    status: paper.status,
    error: paper.error,
    subtests: JSON.parse(paper.subtests) as SubtestCode[],
    totalSlots: paper.totalSlots,
    resolvedSlots: paper.resolvedSlots,
  };
}

export interface PaperListEntry {
  id: number;
  status: string;
  purpose: string;
  subtests: SubtestCode[];
  createdAt: string;
  itemCount: number;
  totalSlots: number | null;
  resolvedSlots: number;
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
      totalSlots: true,
      resolvedSlots: true,
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
    totalSlots: p.totalSlots,
    resolvedSlots: p.resolvedSlots,
  }));
}

/** Item sans la clé — c'est tout ce que le client doit voir pendant la passation. Les champs
 * QCM (stem/options) et production libre (instructions/supportText/stimuli/prepSec/responseSec)
 * sont mutuellement exclusifs selon le subtest de l'item. */
export interface PassationItem {
  id: number;
  position: number;
  typeId: string;
  subtest: SubtestCode;
  // QCM (lexgram/reading/listening)
  stem?: string;
  options?: string[];
  // Production libre (speaking/writing)
  instructions?: string;
  supportText?: string;
  stimuli?: string[];
  prepSec?: number;
  responseSec?: number;
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

  const items = await prisma.trkiItem.findMany({
    where: { paperId, subtest },
    orderBy: { position: "asc" },
  });

  return {
    attemptId: attempt.id,
    subtest,
    durationMin: TRKI1_CONFIG.subtests[subtest].durationMin,
    items: items.map((it) => {
      if (subtest === "speaking") {
        const payload = JSON.parse(it.payload) as WritingSpeakingPayload;
        const timing = SPEAKING_TIMING[it.typeId] ?? { prepSec: 60, responseSec: 120 };
        return {
          id: it.id,
          position: it.position,
          typeId: it.typeId,
          subtest,
          instructions: payload.instructions,
          supportText: payload.supportText,
          stimuli: payload.stimuli,
          prepSec: timing.prepSec,
          responseSec: timing.responseSec,
        };
      }
      const payload = JSON.parse(it.payload) as LexgramPayload;
      return {
        id: it.id,
        position: it.position,
        typeId: it.typeId,
        subtest,
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

/** Soumet le transcript ASR d'une réponse orale et le fait noter par le rater (§7.3 du spec).
 * Score fractionnaire (pointsAwarded, sur item.points) — une tâche de production libre n'est pas
 * 0/1 comme un QCM. `correct` reste posé (seuil 60%) pour le carnet d'erreurs (§J, plus tard). */
export async function submitSpeakingResponseAction(input: {
  attemptId: number;
  itemId: number;
  transcript: string;
  durationSec: number;
}): Promise<{ feedback: RaterFeedback; pointsAwarded: number; maxPoints: number }> {
  const userId = await currentUserId();
  const attempt = await prisma.trkiAttempt.findFirst({ where: { id: input.attemptId, userId } });
  if (!attempt) throw new Error("Tentative introuvable.");
  const item = await prisma.trkiItem.findUniqueOrThrow({ where: { id: input.itemId } });
  const payload = JSON.parse(item.payload) as WritingSpeakingPayload;
  const wordCount = input.transcript.trim().split(/\s+/).filter(Boolean).length;

  const feedback = await gradeSpeaking(payload, input.transcript, {
    durationSec: input.durationSec,
    wordCount,
  });
  const scoreValues = Object.values(feedback.scores);
  const fraction = scoreValues.length
    ? scoreValues.reduce((a, b) => a + b, 0) / (scoreValues.length * 5)
    : 0;
  const pointsAwarded = Math.round(fraction * item.points);
  const correct = fraction >= 0.6;

  await prisma.trkiResponse.upsert({
    where: { attemptId_itemId: { attemptId: input.attemptId, itemId: input.itemId } },
    update: {
      answer: JSON.stringify({ transcript: input.transcript, durationSec: input.durationSec }),
      correct,
      pointsAwarded,
      feedback: JSON.stringify(feedback),
    },
    create: {
      attemptId: input.attemptId,
      itemId: input.itemId,
      answer: JSON.stringify({ transcript: input.transcript, durationSec: input.durationSec }),
      correct,
      pointsAwarded,
      feedback: JSON.stringify(feedback),
    },
  });

  return { feedback, pointsAwarded, maxPoints: item.points };
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
  // TRKI1_CONFIG.subtests[subtest].pointsPerItem ou slot.points, ex. 7 pts/item en lecture, 4 en
  // écoute, 42-43 en speaking) — pas besoin de le relire ici, juste de sommer. Un QCM est 0/points
  // (correct booléen) ; une tâche de production libre (speaking/writing) est notée en fractionnel
  // par le rater (pointsAwarded, submitSpeakingResponseAction) — priorité à pointsAwarded s'il existe.
  const bySubtest = new Map<SubtestCode, { raw: number; max: number }>();
  for (const r of attempt.responses) {
    const subtest = r.item.subtest as SubtestCode;
    const acc = bySubtest.get(subtest) ?? { raw: 0, max: 0 };
    acc.max += r.item.points;
    acc.raw += r.pointsAwarded ?? (r.correct ? r.item.points : 0);
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
  perTarget: {
    targetId: string;
    typeId: string;
    subtest: SubtestCode;
    correct: boolean;
    stem: string;
    pointsAwarded: number | null;
    maxPoints: number;
    feedback: RaterFeedback | null;
  }[];
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
    perTarget: attempt.responses.map((r) => {
      const subtest = r.item.subtest as SubtestCode;
      const stem =
        subtest === "speaking"
          ? (JSON.parse(r.item.payload) as WritingSpeakingPayload).instructions
          : (JSON.parse(r.item.payload) as LexgramPayload).stem;
      return {
        targetId: r.item.targetId,
        typeId: r.item.typeId,
        subtest,
        correct: r.correct ?? false,
        stem,
        pointsAwarded: r.pointsAwarded,
        maxPoints: r.item.points,
        feedback: r.feedback ? (JSON.parse(r.feedback) as RaterFeedback) : null,
      };
    }),
  };
}

// ---- Parcours vocabulaire quotidien (§L) -------------------------------------------

export interface B1VocabWord {
  entryId: number;
  accented: string;
  type: WordType;
  typeLabel: string;
  translationsFr: string | null;
  /** true = déjà "vu" (Encounter posé) — le mot est passé côté collection/SRS. */
  encountered: boolean;
  /** true = dernière tentative de traduction ru→fr correcte (voir b1-curriculum.ts). */
  mastered: boolean;
}

async function loadB1Words(userId: string, entryIds: number[]): Promise<B1VocabWord[]> {
  if (entryIds.length === 0) return [];
  const [entries, encountered, attempts] = await Promise.all([
    prisma.dictionaryEntry.findMany({
      where: { id: { in: entryIds } },
      select: { id: true, accented: true, type: true, translationsFr: true },
    }),
    prisma.encounter.findMany({
      where: { userId, entryId: { in: entryIds } },
      select: { entryId: true },
      distinct: ["entryId"],
    }),
    prisma.quizAttempt.findMany({
      where: { userId, entryId: { in: entryIds }, formKey: "vocab:ru-fr" },
      orderBy: { createdAt: "desc" },
      select: { entryId: true, correct: true },
    }),
  ]);
  const encounteredIds = new Set(encountered.map((e) => e.entryId));
  const masteredIds = new Set<number>();
  const seen = new Set<number>();
  for (const a of attempts) {
    if (a.entryId == null || seen.has(a.entryId)) continue;
    seen.add(a.entryId);
    if (a.correct) masteredIds.add(a.entryId);
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  // Garde l'ordre de la cohorte (familles groupées ensemble), pas l'ordre de retour de la requête.
  return entryIds
    .map((id) => byId.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({
      entryId: e.id,
      accented: e.accented,
      type: e.type as WordType,
      typeLabel: WORD_TYPE_LABELS[e.type as WordType],
      translationsFr: e.translationsFr,
      encountered: encounteredIds.has(e.id),
      mastered: masteredIds.has(e.id),
    }));
}

export interface B1MasteryPoolData {
  toIntroduce: B1VocabWord[];
  toTest: B1VocabWord[];
  /** Déjà maîtrisés (pratique antérieure hors B1) — comptent dans le total du jour sans repasser
   * par la boucle carte/test. */
  alreadyMastered: number;
}

export interface B1Pools {
  scheduledDayIndex: number;
  totalDays: number;
  nouveaux: B1MasteryPoolData;
  /** null quand il n'y a pas (encore) de jour "hier" distinct à retravailler. */
  hier: B1MasteryPoolData | null;
  /** Déjà maîtrisé, plus vieux que "hier" — pratique libre, sans fin (VocabCard existant). */
  mixEntryIds: number[];
}

/** État complet du parcours (§L) : ce qui est dû aujourd'hui (+ retard éventuel accumulé), ce
 * qui relève de "hier" (à retravailler une dernière fois), et ce qui est déjà acquis. Un mot
 * n'est "acquis" que par un test de traduction réussi — jamais simplement "vu". */
export async function getB1PoolsAction(): Promise<B1Pools | null> {
  const userId = await currentUserId();
  const state = await getB1State(userId);
  if (!state) return null;

  const [nouveauxIntro, nouveauxTest, hierIntro, hierTest] = await Promise.all([
    loadB1Words(userId, state.nouveauxToIntroduce),
    loadB1Words(userId, state.nouveauxToTest),
    loadB1Words(userId, state.hierToIntroduce),
    loadB1Words(userId, state.hierToTest),
  ]);

  return {
    scheduledDayIndex: state.scheduledDayIndex,
    totalDays: state.totalDays,
    nouveaux: {
      toIntroduce: nouveauxIntro,
      toTest: nouveauxTest,
      alreadyMastered: state.nouveauxAlreadyMastered,
    },
    hier:
      state.dayIndex === null
        ? null
        : { toIntroduce: hierIntro, toTest: hierTest, alreadyMastered: state.hierAlreadyMastered },
    mixEntryIds: state.mixEntryIds,
  };
}

/** Les 20 mots d'un jour précis du parcours, pour le petit calendrier de consultation
 * (/objectif-b1/reviser) — lecture seule, ne crée ni ne modifie rien. null si ce jour n'a pas
 * encore été atteint. */
export async function getB1DayWordsAction(dayIndex: number): Promise<B1VocabWord[] | null> {
  const userId = await currentUserId();
  const entryIds = await getDayEntryIds(userId, dayIndex);
  if (!entryIds) return null;
  return loadB1Words(userId, entryIds);
}

/** Marque un mot du jour comme "vu" : crée son premier Encounter (le fait entrer dans la
 * collection/le SRS), exactement comme une recherche dans /add — juste depuis le parcours B1. */
export async function introduceB1WordAction(entryId: number): Promise<{ xp: XpAward }> {
  const entry = await prisma.dictionaryEntry.findUnique({
    where: { id: entryId },
    select: { accented: true },
  });
  if (!entry) throw new Error("Mot introuvable.");
  const { xp } = await addEncounterAction({
    entryId,
    rawInput: entry.accented,
    matchedFormKey: null,
    source: "objectif-b1",
  });
  revalidatePath("/objectif-b1/reviser");
  return { xp };
}
