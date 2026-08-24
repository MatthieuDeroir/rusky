import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { ExamPassation } from "@/components/exam-passation";
import { startAttemptAction } from "@/app/objectif-b1/actions";
import type { SubtestCode } from "@/lib/exam/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Passation · Objectif B1 · Русский" };

export default async function PassationPage({
  params,
}: {
  params: Promise<{ paperId: string; subtest: string }>;
}) {
  const { paperId, subtest } = await params;
  const id = Number(paperId);
  if (!Number.isFinite(id)) notFound();

  const data = await startAttemptAction(id, subtest as SubtestCode);
  if ("error" in data) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackButton />
        <p className="text-red-400">{data.error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <ExamPassation data={data} paperId={id} />
    </div>
  );
}
