import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProgress } from "@/lib/learn";
import { isSlot, lessonsToday, openLesson, remainingReviews, slotOf, suggestedSlot } from "@/lib/lessons";
import { Session } from "@/components/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leçon" };

export default async function SessionPage({ searchParams }: { searchParams: Promise<{ lecon?: string }> }) {
  const userId = await currentUserId();
  const { lecon } = await searchParams;
  const lessons = await lessonsToday(userId);
  const slot = isSlot(lecon) ? lecon : suggestedSlot(lessons);
  if (!slot || lessons.find((l) => l.slot === slot)!.done) redirect("/");
  const lesson = await openLesson(userId, slot);
  const [reviews, progress] = await Promise.all([remainingReviews(userId, lesson), getProgress(userId)]);
  // Textes déjà lus (reprise) : on saute les étapes faites.
  const read = new Set(
    (
      await prisma.textProgress.findMany({
        where: {
          userId,
          textId: { in: [lesson.knownTextId, lesson.newTextId].filter((x): x is number => x !== null) },
          completedAt: { not: null },
        },
        select: { textId: true },
      })
    ).map((p) => p.textId),
  );
  // Les textes ne sont PAS demandés ici : un rafraîchissement de la page (après une action)
  // relancerait leur création. La leçon les demande une seule fois, côté navigateur.
  return (
    <Session
      slot={slot}
      of={slotOf(slot)}
      reviews={reviews}
      reviewTotal={(JSON.parse(lesson.reviewIds) as number[]).length}
      read={lesson.newTextId !== null && read.has(lesson.newTextId)}
      before={{ knownB1: progress.knownB1, b1Total: progress.b1Total, level: progress.level.code, streak: progress.streak }}
    />
  );
}
