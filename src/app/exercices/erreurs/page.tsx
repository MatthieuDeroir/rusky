import { BackButton } from "@/components/back-button";
import { ErreursExercise } from "@/components/erreurs-exercise";

export const dynamic = "force-dynamic";
export const metadata = { title: "Travailler ses erreurs · Русский" };

export default function ErreursPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Travailler ses erreurs</h1>
        <p className="text-sm text-foreground/55">
          Uniquement les mots dont la dernière réponse était fausse — jusqu’à ce que tu la
          reprennes correctement.
        </p>
      </div>
      <ErreursExercise />
    </div>
  );
}
