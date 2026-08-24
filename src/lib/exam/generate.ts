// Pipeline de génération d'un TrkiPaper (§B/§H du plan). createPaper() insère un Paper PENDING
// et lance la génération en tâche de fond via after() (next/server) — même pattern que
// scheduleFrenchEnrichment dans src/app/actions.ts, seul précédent "fire and forget" du repo.
// Aucun appel Mistral n'a lieu pendant la passation : tout est généré et validé avant READY.

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { generateLexgramItem, generateSpeakingItem } from "@/lib/mistral";
import { TRKI1_CONFIG, type SubtestCode } from "./config";
import { buildLexgramSlots, LEXGRAM_BLUEPRINT_VERSION, type LexgramSlot } from "./blueprints/lexgram-v1";
import { buildSpeakingSlots, SPEAKING_BLUEPRINT_VERSION, type SpeakingSlot } from "./blueprints/speaking-v1";
import { validateLexgramItem, type ValidationStep } from "./validate";
import { validateSpeakingItem } from "./validate-speaking";
import type { LexgramPayload, WritingSpeakingPayload } from "./types";
import * as caseGovernmentVerbPrompt from "./prompts/lexgram.case-government-verb";
import * as reactiveDialoguePrompt from "./prompts/speaking.reactive-dialogue";
import * as initiativeDialoguePrompt from "./prompts/speaking.initiative-dialogue";
import * as situationalDialoguePrompt from "./prompts/speaking.situational-dialogue";
import * as monologuePrompt from "./prompts/speaking.monologue";

// Concurrence réduite de 4 à 2 : observé en prod, 4 slots en parallèle (chacun générant +
// solveur, jusqu'à MAX_RETRIES fois) déclenchait le rate limit Mistral 429 (voir aussi le
// backoff ajouté dans chatJson, mistral.ts).
const CONCURRENCY = 2;
const MAX_RETRIES = 4;
const BANK_LOOKBACK_PAPERS = 5;

interface LexgramPromptModule {
  systemPrompt: string;
  buildUserPrompt: (slot: LexgramSlot, rejectionReason?: string) => string;
}
interface SpeakingPromptModule {
  systemPrompt: string;
  buildUserPrompt: (slot: SpeakingSlot, rejectionReason?: string) => string;
}

const LEXGRAM_PROMPT_REGISTRY: Record<string, LexgramPromptModule> = {
  "lexgram.case-government-verb": caseGovernmentVerbPrompt as unknown as LexgramPromptModule,
};

const SPEAKING_PROMPT_REGISTRY: Record<string, SpeakingPromptModule> = {
  "speaking.reactive-dialogue": reactiveDialoguePrompt,
  "speaking.initiative-dialogue": initiativeDialoguePrompt,
  "speaking.situational-dialogue": situationalDialoguePrompt,
  "speaking.monologue": monologuePrompt,
};

export interface CreatePaperInput {
  userId: string;
  subtests: SubtestCode[];
  purpose?: "EXAM" | "PRACTICE";
  /** Restreint les typeId lexgram générés — passation indépendante d'une sous-partie (§H). */
  lexgramTypeIds?: string[];
  /** Restreint les typeId speaking générés — même principe. */
  speakingTypeIds?: string[];
}

export async function createPaper(input: CreatePaperInput): Promise<{ paperId: number }> {
  const seed = randomUUID();
  const versions: string[] = [];
  if (input.subtests.includes("lexgram")) versions.push(LEXGRAM_BLUEPRINT_VERSION);
  if (input.subtests.includes("speaking")) versions.push(SPEAKING_BLUEPRINT_VERSION);

  const paper = await prisma.trkiPaper.create({
    data: {
      userId: input.userId,
      seed,
      blueprintVersion: versions.join("+") || "none",
      subtests: JSON.stringify(input.subtests),
      purpose: input.purpose ?? "EXAM",
      status: "PENDING",
    },
  });

  after(() => runGeneration(paper.id, input));

  return { paperId: paper.id };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface ResolvedItem {
  slot: LexgramSlot | SpeakingSlot;
  payload: LexgramPayload | WritingSpeakingPayload;
  answerKey: object;
  bankItemId: number;
}

async function findRecentBankItemIds(userId: string): Promise<Set<number>> {
  const recentPapers = await prisma.trkiPaper.findMany({
    where: { userId, status: "READY" },
    orderBy: { createdAt: "desc" },
    take: BANK_LOOKBACK_PAPERS,
    select: { items: { select: { bankItemId: true } } },
  });
  const ids = new Set<number>();
  for (const p of recentPapers) for (const it of p.items) if (it.bankItemId) ids.add(it.bankItemId);
  return ids;
}

async function resolveSlot(
  slot: LexgramSlot,
  userId: string,
  recentBankItemIds: Set<number>,
): Promise<ResolvedItem | null> {
  const promptModule = LEXGRAM_PROMPT_REGISTRY[slot.typeId];
  if (!promptModule) return null;

  let rejectionReason: string | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userPrompt = promptModule.buildUserPrompt(slot, rejectionReason);
    let raw: unknown;
    try {
      raw = await generateLexgramItem(promptModule.systemPrompt, userPrompt);
    } catch (e) {
      rejectionReason = `appel Mistral échoué : ${e instanceof Error ? e.message : "erreur"}`;
      continue;
    }
    const result = await validateLexgramItem(raw, slot, userId);
    if (result.ok && result.payload && result.answerKey) {
      const contentHash = normalizeContentHash(result.payload.stem);
      const bankItem = await prisma.trkiBankItem.create({
        data: {
          subtest: slot.subtest,
          typeId: slot.typeId,
          targetId: slot.targetId,
          payload: JSON.stringify(result.payload),
          answerKey: JSON.stringify(result.answerKey),
          distractorClasses: JSON.stringify(slot.distractorClasses ?? []),
          contentHash,
          validatedBy: JSON.stringify(result.steps),
          quarantined: false,
          usedCount: 1,
          lastUsedAt: new Date(),
        },
      });
      return { slot, payload: result.payload, answerKey: result.answerKey, bankItemId: bankItem.id };
    }
    if (result.quarantined && result.payload) {
      await prisma.trkiBankItem.create({
        data: {
          subtest: slot.subtest,
          typeId: slot.typeId,
          targetId: slot.targetId,
          payload: JSON.stringify(result.payload),
          answerKey: "{}",
          distractorClasses: JSON.stringify(slot.distractorClasses ?? []),
          contentHash: normalizeContentHash(result.payload.stem),
          validatedBy: JSON.stringify(result.steps),
          quarantined: true,
        },
      });
    } else {
      // Rejeté par une passe 1-5 : jamais éligible au tirage, conservé uniquement pour le taux
      // de rejet par passe sur /admin/health (§N du plan).
      await prisma.trkiBankItem.create({
        data: {
          subtest: slot.subtest,
          typeId: slot.typeId,
          targetId: slot.targetId,
          payload: JSON.stringify(result.payload ?? { raw }),
          answerKey: "{}",
          distractorClasses: JSON.stringify(slot.distractorClasses ?? []),
          contentHash: `rejected-${Date.now()}-${Math.random()}`,
          validatedBy: JSON.stringify(result.steps),
          rejected: true,
        },
      });
    }
    rejectionReason = describeFailure(result.steps);
  }

  // Fallback banque : un item déjà validé pour ce typeId/targetId, pas quarantained, pas
  // resservi dans les BANK_LOOKBACK_PAPERS derniers sujets de l'utilisateur.
  const candidates = await prisma.trkiBankItem.findMany({
    where: { typeId: slot.typeId, targetId: slot.targetId, quarantined: false, rejected: false },
    orderBy: { usedCount: "asc" },
    take: 10,
  });
  const fallback = candidates.find((c) => !recentBankItemIds.has(c.id)) ?? candidates[0];
  if (!fallback) return null;

  await prisma.trkiBankItem.update({
    where: { id: fallback.id },
    data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  const payload = JSON.parse(fallback.payload) as LexgramPayload;
  const answerKey = JSON.parse(fallback.answerKey) as Record<string, unknown>;
  return { slot, payload, answerKey, bankItemId: fallback.id };
}

async function resolveSpeakingSlot(
  slot: SpeakingSlot,
  recentBankItemIds: Set<number>,
): Promise<ResolvedItem | null> {
  const promptModule = SPEAKING_PROMPT_REGISTRY[slot.typeId];
  if (!promptModule) return null;

  let rejectionReason: string | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userPrompt = promptModule.buildUserPrompt(slot, rejectionReason);
    let raw: unknown;
    try {
      raw = await generateSpeakingItem(promptModule.systemPrompt, userPrompt);
    } catch (e) {
      rejectionReason = `appel Mistral échoué : ${e instanceof Error ? e.message : "erreur"}`;
      continue;
    }
    const result = await validateSpeakingItem(raw, slot);
    if (result.ok && result.payload) {
      const contentHash = normalizeContentHash(
        result.payload.instructions + (result.payload.supportText ?? "") + (result.payload.stimuli?.join("") ?? ""),
      );
      const bankItem = await prisma.trkiBankItem.create({
        data: {
          subtest: slot.subtest,
          typeId: slot.typeId,
          targetId: slot.targetId,
          payload: JSON.stringify(result.payload),
          answerKey: "{}",
          distractorClasses: "[]",
          contentHash,
          validatedBy: JSON.stringify(result.steps),
          quarantined: false,
          usedCount: 1,
          lastUsedAt: new Date(),
        },
      });
      return { slot, payload: result.payload, answerKey: {}, bankItemId: bankItem.id };
    }
    // Pas de passe de contre-résolution côté speaking (production libre, pas de clé à vérifier) —
    // tout échec est un rejet direct (schéma/alphabet/structure/lexique), jamais une quarantaine.
    await prisma.trkiBankItem.create({
      data: {
        subtest: slot.subtest,
        typeId: slot.typeId,
        targetId: slot.targetId,
        payload: JSON.stringify(result.payload ?? { raw }),
        answerKey: "{}",
        distractorClasses: "[]",
        contentHash: `rejected-${Date.now()}-${Math.random()}`,
        validatedBy: JSON.stringify(result.steps),
        rejected: true,
      },
    });
    rejectionReason = describeFailure(result.steps);
  }

  const candidates = await prisma.trkiBankItem.findMany({
    where: { typeId: slot.typeId, targetId: slot.targetId, quarantined: false, rejected: false },
    orderBy: { usedCount: "asc" },
    take: 10,
  });
  const fallback = candidates.find((c) => !recentBankItemIds.has(c.id)) ?? candidates[0];
  if (!fallback) return null;

  await prisma.trkiBankItem.update({
    where: { id: fallback.id },
    data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  const payload = JSON.parse(fallback.payload) as WritingSpeakingPayload;
  return { slot, payload, answerKey: {}, bankItemId: fallback.id };
}

function normalizeContentHash(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^а-яё0-9]+/g, " ")
    .trim();
}

function describeFailure(steps: ValidationStep[]): string {
  const failed = steps.find((s) => !s.ok);
  return failed ? `Passe "${failed.name}" rejetée : ${failed.detail ?? "raison non précisée"}.` : "raison inconnue";
}

// Passes supplémentaires ciblant uniquement les slots encore non résolus après le premier passage
// (chacun ayant déjà épuisé MAX_RETRIES tentatives + repli banque). Une passe d'un item peut
// échouer pour une raison ponctuelle (structure QCM dupliquée, mauvais mot mis en trou…) sans que
// ce soit systématique — retenter donne une vraie deuxième chance avant d'abandonner le sujet.
const TOP_UP_ROUNDS = 2;

async function runGeneration(paperId: number, input: CreatePaperInput): Promise<void> {
  await prisma.trkiPaper.update({ where: { id: paperId }, data: { status: "GENERATING" } });
  const paper = await prisma.trkiPaper.findUniqueOrThrow({ where: { id: paperId } });

  try {
    const slots: (LexgramSlot | SpeakingSlot)[] = [
      ...(input.subtests.includes("lexgram") ? buildLexgramSlots(paper.seed, input.lexgramTypeIds) : []),
      ...(input.subtests.includes("speaking") ? buildSpeakingSlots(paper.seed, input.speakingTypeIds) : []),
    ];

    if (slots.length === 0) {
      await prisma.trkiPaper.update({
        where: { id: paperId },
        data: { status: "FAILED", error: "Aucun slot à générer pour les sous-tests demandés." },
      });
      return;
    }

    await prisma.trkiPaper.update({
      where: { id: paperId },
      data: { totalSlots: slots.length, resolvedSlots: 0 },
    });

    const recentBankItemIds = await findRecentBankItemIds(input.userId);
    const resolved: (ResolvedItem | null)[] = new Array(slots.length).fill(null);

    async function resolveAndTrack(index: number) {
      const slot = slots[index];
      resolved[index] =
        slot.subtest === "lexgram"
          ? await resolveSlot(slot, input.userId, recentBankItemIds)
          : await resolveSpeakingSlot(slot, recentBankItemIds);
      const resolvedCount = resolved.filter((r) => r !== null).length;
      await prisma.trkiPaper
        .update({ where: { id: paperId }, data: { resolvedSlots: resolvedCount } })
        .catch(() => {}); // la progression n'est qu'informative, jamais bloquante
    }

    await mapWithConcurrency(
      slots.map((_, i) => i),
      CONCURRENCY,
      resolveAndTrack,
    );

    for (let round = 0; round < TOP_UP_ROUNDS; round++) {
      const stillFailed = resolved.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0);
      if (stillFailed.length === 0) break;
      await mapWithConcurrency(stillFailed, CONCURRENCY, resolveAndTrack);
    }

    const failedCount = resolved.filter((r) => r === null).length;
    if (failedCount > 0) {
      await prisma.trkiPaper.update({
        where: { id: paperId },
        data: {
          status: "FAILED",
          error: `${failedCount}/${slots.length} item(s) n'ont pas pu être générés ni resservis depuis la banque (après ${TOP_UP_ROUNDS + 1} passages).`,
        },
      });
      return;
    }

    await prisma.$transaction(
      resolved.map((r, i) =>
        prisma.trkiItem.create({
          data: {
            paperId,
            bankItemId: r!.bankItemId,
            subtest: r!.slot.subtest,
            typeId: r!.slot.typeId,
            targetId: r!.slot.targetId,
            position: i,
            payload: JSON.stringify(r!.payload),
            answerKey: JSON.stringify(r!.answerKey),
            // Barème officiel (docs/adr/0006) : 1 pt/item en lexgram, 7 en lecture, 4 en écoute —
            // uniforme par sous-test. speaking/writing pèsent différemment par tâche (slot.points,
            // ex. 42/42/43/43 pour les 4 tâches speaking) : priorité au poids du slot s'il existe.
            points:
              r!.slot.points ??
              (TRKI1_CONFIG.subtests[r!.slot.subtest] as { pointsPerItem?: number }).pointsPerItem ??
              1,
          },
        }),
      ),
    );

    await prisma.trkiPaper.update({ where: { id: paperId }, data: { status: "READY", readyAt: new Date() } });
  } catch (e) {
    await prisma.trkiPaper.update({
      where: { id: paperId },
      data: { status: "FAILED", error: e instanceof Error ? e.message : "Erreur inconnue" },
    });
  }
}
