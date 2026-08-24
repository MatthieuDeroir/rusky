import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { ExamResults } from "@/components/exam-results";
import { getAttemptResultsAction } from "@/app/objectif-b1/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Résultats · Objectif B1 · Русский" };

export default async function ResultatsPage({
  searchParams,
}: {
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const { attemptId } = await searchParams;
  const id = Number(attemptId);
  if (!Number.isFinite(id)) notFound();

  const data = await getAttemptResultsAction(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <h1 className="text-2xl font-semibold">Résultats</h1>
      <ExamResults data={data} />
    </div>
  );
}
