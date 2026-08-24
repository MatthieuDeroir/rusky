import { BackButton } from "@/components/back-button";
import { ExamensHub } from "@/components/examens-hub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Examens · Objectif B1 · Русский" };

export default function ExamensPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Examens blancs</h1>
        <p className="text-sm text-foreground/55">
          Sujet complet ou juste une partie — chaque tentative compte pour le suivi de
          progression.
        </p>
      </div>
      <ExamensHub />
    </div>
  );
}
