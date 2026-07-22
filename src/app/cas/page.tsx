import { getCollectedCaseTriggers } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";
import { CaseTrainer } from "@/components/case-trainer";

export const dynamic = "force-dynamic";

export default async function CasPage() {
  const userId = await currentUserId();
  const collected = await getCollectedCaseTriggers(userId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cas</h1>
        <p className="text-sm text-foreground/55">
          Quel cas après quelle préposition ou quel verbe ? Révise la règle, puis entraîne-toi
          sur tes mots.
        </p>
      </div>
      <CaseTrainer collected={collected} />
    </div>
  );
}
