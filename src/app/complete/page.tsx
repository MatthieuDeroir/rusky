import { QuizCard } from "@/components/quiz-card";

export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const { theme } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compléter</h1>
        <p className="text-sm text-foreground/55">
          Découvre les formes que tu n’as pas encore rencontrées : cas, conjugaisons et
          déclinaisons.
        </p>
      </div>
      <QuizCard mode="undiscovered" theme={theme} />
    </div>
  );
}
