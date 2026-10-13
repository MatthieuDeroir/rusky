"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { parisDay } from "@/lib/dates";
import { cardsFor, keepWord, learnFromText, lexiconCoverage, listWhere, recordAnswer, setWordStatus, spreadKnownAt, type Card } from "@/lib/learn";
import { isSlot, type SlotId } from "@/lib/lessons";
import { currentPlan } from "@/lib/memory";
import { analysisCoverage, familiarEntryIds } from "@/lib/coverage";
import { createDailyText, ensureQuestions, fillGeneratedText, type ComprehensionQuestion, type TextAnswer } from "@/lib/texts";
import { runAnalysis } from "@/lib/reader/analyze";
import { splitParagraphs } from "@/lib/reader/segment";
import type { ReaderAnalysis } from "@/lib/reader/types";
import type { Rating } from "@/lib/srs";

// ---- Cartes ------------------------------------------------------------------------------

export async function answerCardAction(entryId: number, answer: Rating | "known") {
  const userId = await currentUserId();
  return recordAnswer(userId, entryId, answer);
}

/** Statut déclaré depuis la liste des mots ou la fiche d'un mot. */
export async function setWordStatusAction(entryId: number, known: boolean): Promise<string> {
  const userId = await currentUserId();
  const status = await setWordStatus(userId, entryId, known);
  revalidatePath("/", "layout");
  return status;
}

/** Tri rapide (Mots → trier un lexique) : ces mots sont déjà connus. Par lots, dans l'ordre. */
export async function markKnownAction(entryIds: number[]) {
  const userId = await currentUserId();
  const ids = entryIds.slice(0, 100);
  for (const id of ids) await setWordStatus(userId, id, true);
  // Appris avant, souvent hors de l'app : daté sur les mois actifs, au prorata de chacun.
  await spreadKnownAt(userId, ids);
  // Pas de revalidatePath ici : il ferait recalculer la page de tri à chaque lot (lent). Les
  // pages sont dynamiques ; le retour vers Mots se fait par un rechargement complet.
}

/** Plusieurs réponses d'un coup (connexion lente : une requête au lieu de N), dans l'ordre. */
export async function answerCardsAction(jobs: { entryId: number; answer: Rating | "known" }[]) {
  const userId = await currentUserId();
  for (const j of jobs.slice(0, 100)) await recordAnswer(userId, j.entryId, j.answer);
}

/** Vide le cache de navigation (pages gardées 2 min en mémoire) après une séance. */
export async function invalidateAction() {
  revalidatePath("/", "layout");
}

// ---- Textes ------------------------------------------------------------------------------

async function readable(id: number, userId: string) {
  const t = await prisma.text.findUnique({ where: { id } });
  if (!t || (t.userId !== null && t.userId !== userId)) throw new Error("Texte introuvable");
  return t;
}

export interface TextState {
  id: number;
  title: string;
  source: string;
  status: string;
  analysis: ReaderAnalysis | null;
  questions: ComprehensionQuestion[];
  answers: Record<string, TextAnswer>;
  completed: boolean;
  error: string | null;
  /** Mots familiers (connus, en cours, mots-outils) / mots du texte, et les mots nouveaux. */
  coverage: { known: number; total: number; newEntryIds: number[] } | null;
  /** La même couverture avec le vocabulaire d'il y a un mois (preuve de progrès). */
  coverageMonthAgo: { known: number; total: number } | null;
}

export async function textStateAction(id: number): Promise<TextState> {
  const userId = await currentUserId();
  const t = await readable(id, userId);
  const [p, familiar, familiarThen] = await Promise.all([
    prisma.textProgress.findUnique({ where: { userId_textId: { userId, textId: id } } }),
    t.analysis ? familiarEntryIds(userId) : null,
    t.analysis ? familiarEntryIds(userId, { asOf: new Date(Date.now() - 30 * 86_400_000) }) : null,
  ]);
  const analysis = t.analysis ? (JSON.parse(t.analysis) as ReaderAnalysis) : null;
  return {
    id,
    title: t.title,
    source: t.source,
    status: t.status,
    analysis,
    questions: t.questions ? JSON.parse(t.questions) : [],
    answers: p ? JSON.parse(p.answers) : {},
    completed: !!p?.completedAt,
    error: t.error,
    coverage: analysis && familiar ? analysisCoverage(analysis, familiar) : null,
    coverageMonthAgo: analysis && familiarThen ? analysisCoverage(analysis, familiarThen) : null,
  };
}

/** Le texte d'une leçon : 95 % de mots connus, les 5 % restants sont des mots nouveaux du lexique
 * en cours (soulignés à la lecture) ; sa longueur dépend du nombre de mots nouveaux prévu par la
 * mémoire. Créé à la première demande et écrit en tâche de fond pendant les révisions ; un
 * rechargement de la page renvoie le même. Un texte en échec est remplacé. */
export async function lessonTextsAction(slot: SlotId): Promise<{ newId: number }> {
  const userId = await currentUserId();
  if (!isSlot(slot)) throw new Error("Leçon inconnue");
  const key = { userId_day_slot: { userId, day: parisDay(), slot } };
  const lesson = await prisma.lesson.findUnique({ where: key });
  if (!lesson) throw new Error("Leçon non commencée");
  const usable = async (id: number | null) =>
    id !== null && ((await prisma.text.findUnique({ where: { id }, select: { status: true } }))?.status ?? "FAILED") !== "FAILED";
  const ensure = async (field: "knownTextId" | "newTextId"): Promise<number> => {
    const current = lesson[field];
    if (await usable(current)) return current!;
    const t = await prisma.text.create({
      data: { userId, source: "lesson", title: "Урок", body: "", status: "GENERATING", error: "en cours", forDay: parisDay() },
    });
    // Seul le premier appel gagne (rechargement simultané) ; le perdant reprend le texte du gagnant.
    const won = await prisma.lesson.updateMany({ where: { ...key.userId_day_slot, [field]: current }, data: { [field]: t.id } });
    if (!won.count) {
      await prisma.text.delete({ where: { id: t.id } });
      return (await prisma.lesson.findUnique({ where: key }))![field]!;
    }
    const { newPerLesson } = await currentPlan(userId);
    after(() => fillGeneratedText(t.id, userId, "lesson", newPerLesson));
    return t.id;
  };
  const newId = await ensure("newTextId");
  return { newId };
}

/** Révisions de la leçon terminées. */
export async function lessonReviewsDoneAction(slot: SlotId) {
  const userId = await currentUserId();
  await prisma.lesson.updateMany({ where: { userId, day: parisDay(), slot, reviewsDoneAt: null }, data: { reviewsDoneAt: new Date() } });
}

export async function completeLessonAction(slot: SlotId) {
  const userId = await currentUserId();
  await prisma.lesson.updateMany({
    where: { userId, day: parisDay(), slot, completedAt: null },
    data: { completedAt: new Date(), reviewsDoneAt: new Date() },
  });
  revalidatePath("/", "layout");
}

/** Les mots nouveaux d'un texte, une fois lu (pour le bilan) : les imposés et ceux du lexique en
 * cours que la lecture a fait entrer dans le parcours. */
export async function textNewWordsAction(textId: number): Promise<Card[]> {
  const userId = await currentUserId();
  const t = await readable(textId, userId);
  const added = await prisma.word.findMany({
    where: { userId, origin: "learn", source: t.title, firstSeenAt: { gte: new Date(Date.now() - 6 * 3_600_000) } },
    select: { entryId: true },
  });
  const ids = [...new Set([...(t.newEntryIds ? (JSON.parse(t.newEntryIds) as number[]) : []), ...added.map((w) => w.entryId)])];
  return cardsFor(userId, ids);
}

/** Crée un nouveau texte du jour et lance son écriture (utilisable pendant un rendu). */
async function startNewDailyText(userId: string): Promise<number> {
  const id = await createDailyText(userId, { fresh: true });
  await prisma.text.update({ where: { id }, data: { error: "en cours" } });
  after(() => fillGeneratedText(id, userId));
  return id;
}

/** Texte d'entraînement écrit uniquement avec les mots connus (ne compte pas comme texte du jour). */
export async function newPracticeTextAction(): Promise<{ id: number }> {
  const userId = await currentUserId();
  const t = await prisma.text.create({
    data: { userId, source: "practice", title: "Тренировка", body: "", status: "GENERATING", error: "en cours" },
  });
  after(() => fillGeneratedText(t.id, userId, "known"));
  revalidatePath("/lire");
  return { id: t.id };
}

/** « Un autre texte à mon niveau » : un nouveau texte du jour, écrit avec le vocabulaire actuel. */
export async function newDailyTextAction(): Promise<{ id: number }> {
  const userId = await currentUserId();
  const id = await startNewDailyText(userId);
  revalidatePath("/lire");
  return { id };
}

export async function retryTextAction(id: number) {
  const userId = await currentUserId();
  const t = await readable(id, userId);
  if ((t.source === "generated" || t.source === "practice" || t.source === "lesson") && !t.body) {
    await prisma.text.update({ where: { id }, data: { status: "GENERATING", error: "en cours" } });
    const { newPerLesson } = await currentPlan(userId);
    after(() =>
      fillGeneratedText(id, userId, t.source === "practice" ? "known" : t.source === "lesson" ? "lesson" : "level", newPerLesson),
    );
  } else {
    await prisma.text.update({ where: { id }, data: { status: "ANALYZING", error: null } });
    after(() => runAnalysis(id, { onlyFailed: true }));
  }
}

/** Ouvre un texte : lance l'analyse et les questions s'il n'en a pas encore. */
export async function openTextAction(id: number) {
  const userId = await currentUserId();
  const t = await readable(id, userId);
  if (t.status === "PENDING") {
    const claimed = await prisma.text.updateMany({ where: { id, status: "PENDING" }, data: { status: "ANALYZING" } });
    if (claimed.count) after(() => runAnalysis(id));
  }
  if (!t.questions && t.body) after(() => ensureQuestions(id).catch((e) => console.error("[questions]", id, e)));
}

export async function answerQuestionAction(textId: number, questionId: string, choice: number) {
  const userId = await currentUserId();
  const t = await readable(textId, userId);
  const q = (JSON.parse(t.questions ?? "[]") as ComprehensionQuestion[]).find((x) => x.id === questionId);
  if (!q) throw new Error("Question introuvable");
  const correct = choice === q.answer;
  const p = await prisma.textProgress.findUnique({ where: { userId_textId: { userId, textId } } });
  const answers = JSON.parse(p?.answers ?? "{}") as Record<string, TextAnswer>;
  // Seule la première réponse compte : c'est elle qui mesure la compréhension.
  if (!(questionId in answers)) {
    answers[questionId] = { choice, correct };
    const right = Object.values(answers).filter((a) => a.correct).length;
    await prisma.textProgress.upsert({
      where: { userId_textId: { userId, textId } },
      create: { userId, textId, answers: JSON.stringify(answers), right, total: 1 },
      update: { answers: JSON.stringify(answers), right, total: Object.keys(answers).length },
    });
    const day = parisDay();
    await prisma.dayLog.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, readingTotal: 1, readingRight: correct ? 1 : 0 },
      update: { readingTotal: { increment: 1 }, readingRight: { increment: correct ? 1 : 0 } },
    });
  }
  return { correct, answer: q.answer };
}

export async function completeTextAction(textId: number) {
  const userId = await currentUserId();
  const t = await readable(textId, userId);
  // Mots nouveaux rencontrés : les imposés du texte de leçon, et tous ceux du lexique en cours
  // (niveau actuel) présents dans le texte, entrent dans le parcours « en cours ». Les mots de
  // niveau supérieur croisés en route ne sont pas ajoutés.
  if (t.analysis) {
    const analysis = JSON.parse(t.analysis) as ReaderAnalysis;
    const inText = [...new Set(analysis.paragraphs.flatMap((p) => (p.sentences ?? []).flatMap((s) => s.words.map((w) => w.entryId))))].filter(
      (x): x is number => x !== null,
    );
    const { focus } = await lexiconCoverage(userId);
    const focusIds = focus
      ? (
          await prisma.dictionaryEntry.findMany({
            where: { AND: [{ id: { in: inText } }, listWhere(focus)] },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [];
    const ids = [...new Set([...(t.newEntryIds ? (JSON.parse(t.newEntryIds) as number[]) : []), ...focusIds])];
    const sentences = new Map<number, string>();
    for (const p of analysis.paragraphs)
      for (const s of p.sentences ?? []) {
        const text = s.tokens.map((x) => x.t).join("");
        for (const w of s.words) if (w.entryId !== null && ids.includes(w.entryId) && !sentences.has(w.entryId)) sentences.set(w.entryId, text);
      }
    await learnFromText(userId, ids, sentences, t.title);
  }
  const p = await prisma.textProgress.findUnique({ where: { userId_textId: { userId, textId } } });
  if (p?.completedAt) return;
  await prisma.textProgress.upsert({
    where: { userId_textId: { userId, textId } },
    create: { userId, textId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
  const day = parisDay();
  await prisma.dayLog.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, textsRead: 1 },
    update: { textsRead: { increment: 1 } },
  });
  revalidatePath("/lire");
}

export async function keepWordAction(textId: number, entryId: number, sentence: string) {
  const userId = await currentUserId();
  const t = await readable(textId, userId);
  await keepWord(userId, entryId, sentence, t.title);
}

export async function pasteTextAction(input: { title: string; body: string }): Promise<{ id: number }> {
  const userId = await currentUserId();
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (!/[а-яё]/i.test(body)) throw new Error("Le texte ne contient pas de russe.");
  if (body.length > 6000) throw new Error(`Texte trop long (${body.length} caractères, 6000 au plus).`);
  const first = splitParagraphs(body)[0] ?? "";
  const title = input.title.trim() || (first.length > 48 ? `${first.slice(0, 45)}…` : first);
  const t = await prisma.text.create({ data: { userId, source: "pasted", title, body, status: "ANALYZING" } });
  after(async () => {
    await runAnalysis(t.id);
    await ensureQuestions(t.id).catch((e) => console.error("[questions]", t.id, e));
  });
  revalidatePath("/lire");
  return { id: t.id };
}

export async function deleteTextAction(id: number) {
  const userId = await currentUserId();
  const t = await readable(id, userId);
  if (t.userId !== userId) throw new Error("Seuls tes propres textes peuvent être supprimés.");
  await prisma.text.delete({ where: { id } });
  revalidatePath("/lire");
}

// ---- Réglages ----------------------------------------------------------------------------

export async function saveSettingsAction(input: { examDate: string | null }) {
  const userId = await currentUserId();
  const examDate = input.examDate && /^\d{4}-\d{2}-\d{2}$/.test(input.examDate) ? input.examDate : null;
  await prisma.settings.upsert({ where: { userId }, update: { examDate }, create: { userId, examDate } });
  revalidatePath("/progres");
  revalidatePath("/");
}

// ---- Bilan -------------------------------------------------------------------------------

export async function progressSnapshotAction() {
  const userId = await currentUserId();
  const { getProgress } = await import("@/lib/learn");
  const p = await getProgress(userId);
  revalidatePath("/", "layout"); // l'accueil et Progrès doivent refléter la séance
  return { knownB1: p.knownB1, b1Total: p.b1Total, level: p.level.code, streak: p.streak };
}

// ---- Rappels -----------------------------------------------------------------------------

export async function subscribePushAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const userId = await currentUserId();
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function unsubscribePushAction(endpoint: string) {
  const userId = await currentUserId();
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/** Notification d'essai, pour vérifier que les rappels arrivent sur cet appareil. */
export async function testPushAction(): Promise<number> {
  const userId = await currentUserId();
  const { sendToUser } = await import("@/lib/push");
  return sendToUser(userId, {
    title: "Rusky",
    body: "Les rappels fonctionnent sur cet appareil : 7 h, 14 h, 19 h et 23 h.",
    url: "/",
    tag: "rusky-test",
  });
}
