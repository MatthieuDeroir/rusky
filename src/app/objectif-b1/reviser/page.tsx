import { BackButton } from "@/components/back-button";
import { B1Reviser } from "@/components/b1-reviser";
import {
  getB1TodayCohortAction,
  getB1YesterdayEntryIdsAction,
  getB1MixEntryIdsAction,
} from "@/app/objectif-b1/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réviser B1 · Русский" };

export default async function ReviserB1Page() {
  const [cohort, yesterdayIds, mixIds] = await Promise.all([
    getB1TodayCohortAction(),
    getB1YesterdayEntryIdsAction(),
    getB1MixEntryIdsAction(),
  ]);

  return (
    <div className="relative mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Vocabulaire B1</h1>
        <p className="text-sm text-foreground/55">
          20 mots par jour, tirés du minimum lexical В1 — nouveaux mots, révision d’hier, puis
          mélange de tout ce qui a déjà été introduit.
        </p>
      </div>
      <B1Reviser cohort={cohort} yesterdayIds={yesterdayIds} mixIds={mixIds} />
    </div>
  );
}
