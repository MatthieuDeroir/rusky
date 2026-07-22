import { TranslateCard } from "@/components/translate-card";

export default async function TranslatePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const { theme } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Traduire</h1>
        <p className="text-sm text-foreground/55">
          Traduis tes mots découverts, dans les deux sens. Verbes à l’infinitif, noms au
          nominatif.
        </p>
      </div>
      <TranslateCard theme={theme} />
    </div>
  );
}
