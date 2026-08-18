import { BackButton } from "@/components/back-button";
import { VocabCard } from "@/components/vocab-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Traduire · Русский" };

export default function TraduirePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Traduire</h1>
        <p className="text-sm text-foreground/55">
          Vocabulaire pur : te rappeler le sens d’un mot, sans avoir à le décliner ni le
          conjuguer.
        </p>
      </div>
      <VocabCard />
    </div>
  );
}
