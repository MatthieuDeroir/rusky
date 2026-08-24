import { BackButton } from "@/components/back-button";
import { B1Reviser } from "@/components/b1-reviser";
import { getB1PoolsAction } from "@/app/objectif-b1/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réviser B1 · Русский" };

export default async function ReviserB1Page() {
  const pools = await getB1PoolsAction();

  return (
    <div className="relative mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Vocabulaire B1</h1>
        <p className="text-sm text-foreground/55">
          20 mots par jour, tirés du minimum lexical В1 — un jour n’est acquis qu’une fois chaque
          mot validé par un test de traduction, pas juste vu.
        </p>
      </div>
      <B1Reviser initial={pools} />
    </div>
  );
}
