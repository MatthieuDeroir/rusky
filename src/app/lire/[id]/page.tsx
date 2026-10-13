import { notFound } from "next/navigation";
import { after } from "next/server";
import { runAnalysis } from "@/lib/reader/analyze";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { Reader } from "@/components/reader/reader";
import type { ReaderAnalysis, ReaderAnswer, ReadingStatus } from "@/lib/reader/types";

export const dynamic = "force-dynamic";

const BACK_LABELS: Record<string, string> = { "/jour": "Aujourd’hui", "/seance": "Séance" };

export default async function LireTextPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id: raw }, { from }] = await Promise.all([params, searchParams]);
  // Retour vers l'écran d'origine (chemin interne uniquement).
  const backHref = from && /^\/[a-z0-9/_-]*$/i.test(from) ? from : "/lire";
  const backLabel = BACK_LABELS[backHref] ?? (backHref.startsWith("/seance") ? "Séance" : "Bibliothèque");
  const id = Number(raw);
  if (!Number.isInteger(id)) notFound();
  const userId = await currentUserId();
  const [text, progress] = await Promise.all([
    prisma.readingText.findUnique({ where: { id } }),
    prisma.readingProgress.findUnique({ where: { userId_textId: { userId, textId: id } } }),
  ]);
  if (!text || (text.userId !== null && text.userId !== userId)) notFound();

  // Corpus : analysé à la première ouverture. Le passage PENDING → ANALYZING est atomique pour
  // qu'une double ouverture ne lance pas deux analyses.
  if (text.source === "corpus" && text.status === "PENDING") {
    const claimed = await prisma.readingText.updateMany({ where: { id, status: "PENDING" }, data: { status: "ANALYZING" } });
    if (claimed.count === 1) {
      text.status = "ANALYZING";
      after(() => runAnalysis(id));
    }
  }

  const analysis = text.analysis ? (JSON.parse(text.analysis) as ReaderAnalysis) : null;
  const entryIds = [
    ...new Set(
      (analysis?.paragraphs ?? [])
        .flatMap((p) => p.sentences ?? [])
        .flatMap((s) => s.words)
        .map((w) => w.entryId)
        .filter((x): x is number => x !== null),
    ),
  ];
  const collected = entryIds.length
    ? await prisma.encounter.findMany({
        where: { userId, entryId: { in: entryIds } },
        select: { entryId: true },
        distinct: ["entryId"],
      })
    : [];

  return (
    <Reader
      textId={text.id}
      title={text.title}
      backHref={backHref}
      backLabel={backLabel}
      attribution={text.attribution}
      initialStatus={text.status as ReadingStatus}
      initialAnalysis={analysis}
      initialError={text.error}
      initialAnswers={JSON.parse(progress?.answers ?? "{}") as Record<string, ReaderAnswer>}
      initialCompleted={!!progress?.completedAt}
      collectedEntryIds={collected.map((c) => c.entryId!).filter(Boolean)}
    />
  );
}
