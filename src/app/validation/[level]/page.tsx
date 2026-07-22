import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { ProductionExam } from "@/components/production-exam";
import { getPassedTasks } from "@/lib/torfl-store";
import { currentUserId } from "@/lib/auth";
import { findLevel, levelValidated } from "@/lib/torfl";

export const dynamic = "force-dynamic";

export default async function LevelPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: levelId } = await params;
  const level = findLevel(decodeURIComponent(levelId));
  if (!level) notFound();

  const userId = await currentUserId();
  const passed = await getPassedTasks(userId);
  const done = levelValidated(level, passed);

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {level.title}
          {done && <Check className="size-6 text-emerald-300" />}
        </h1>
        <p className="text-sm text-foreground/55">{level.subtitle}</p>
        <p className="mt-1 text-xs text-foreground/40">
          Valide les {level.tasks.length} épreuves de ce niveau pour le valider.
        </p>
      </div>

      <div className="space-y-4">
        {level.tasks.map((task) => (
          <ProductionExam key={task.id} task={task} passed={passed.has(task.id)} />
        ))}
      </div>
    </div>
  );
}
