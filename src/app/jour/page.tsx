import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { parisDay } from "@/lib/dates";
import { TodayView } from "@/components/reader/today-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aujourd’hui · Русский" };

export default async function JourPage() {
  const userId = await currentUserId();
  const decode = await prisma.readingText.findFirst({
    where: { userId, purpose: "decode", forDay: parisDay() },
    select: { progress: { where: { userId }, select: { completedAt: true } } },
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Aujourd’hui</h1>
        <p className="text-sm text-foreground/55">
          10 à 20 minutes pour consolider les structures déjà vues. La nouveauté, c’est le week-end.
        </p>
      </div>
      <TodayView decodeDone={!!decode?.progress[0]?.completedAt} />
    </div>
  );
}
