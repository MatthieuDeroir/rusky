import Link from "next/link";
import { getThemes } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";
import { ExercicesBrowser } from "@/components/exercices-browser";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ExercicesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const userId = await currentUserId();
  const themes = await getThemes(userId);

  if (themes.length === 0) {
    return (
      <div className="glass-strong mx-auto mt-10 max-w-xl rounded-3xl p-10 text-center">
        <h1 className="text-2xl font-semibold">Aucun thème pour l’instant</h1>
        <p className="mt-3 text-foreground/65">
          Ajoute des mots à ta collection : ils seront regroupés ici par type puis par
          déclinaison / conjugaison.
        </p>
        <Button render={<Link href="/add" />} nativeButton={false} size="lg" className="mt-6">
          Ajouter un mot
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Exercices par thème</h1>
        <p className="text-sm text-foreground/55">
          Choisis un type, puis une déclinaison / conjugaison, et entraîne-toi sur ce groupe.
        </p>
      </div>
      <ExercicesBrowser themes={themes} initialType={type} />
    </div>
  );
}
