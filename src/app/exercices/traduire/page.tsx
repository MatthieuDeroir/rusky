import { BackButton } from "@/components/back-button";
import { VocabCard } from "@/components/vocab-card";
import { levelLabel } from "@/lib/srs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Traduire · Русский" };

export default async function TraduirePage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level } = await searchParams;
  const levelFilter = level !== undefined && /^\d+$/.test(level) ? Number(level) : undefined;

  return (
    <div className="relative mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Traduire</h1>
        <p className="text-sm text-foreground/55">
          {levelFilter !== undefined
            ? `Uniquement tes mots de niveau ${levelFilter} — ${levelLabel(levelFilter)}.`
            : "Vocabulaire pur : te rappeler le sens d’un mot, sans avoir à le décliner ni le conjuguer."}
        </p>
      </div>
      <VocabCard level={levelFilter} />
    </div>
  );
}
