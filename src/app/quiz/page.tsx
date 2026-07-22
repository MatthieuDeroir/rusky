import { QuizCard } from "@/components/quiz-card";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const { theme } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pratiquer</h1>
        <p className="text-sm text-foreground/55">
          Révise les formes que tu as déjà découvertes pour les ancrer.
        </p>
      </div>
      <QuizCard mode="discovered" theme={theme} />
    </div>
  );
}
