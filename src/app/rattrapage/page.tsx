import { getReviewSummary } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";
import { RattrapageView } from "@/components/rattrapage-view";

export const dynamic = "force-dynamic";

export default async function RattrapagePage() {
  const userId = await currentUserId();
  const counts = await getReviewSummary(userId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rattrapage</h1>
        <p className="text-sm text-foreground/55">
          Reviens uniquement sur les mots que tu as ratés, par type d’exercice. Une bonne
          réponse les retire de la liste.
        </p>
      </div>
      <RattrapageView counts={counts} />
    </div>
  );
}
