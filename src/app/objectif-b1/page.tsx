import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Objectif B1 · Русский" };

// Tableau de bord complet (couverture, checklist du jour, KPI, recommandation IA) construit à
// l'étape 5-7 du plan une fois le moteur d'examen prouvé et l'import B1 branché. Pour l'instant,
// entrée minimale vers les examens le temps que le reste du hub arrive.
export default function ObjectifB1Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Objectif B1</h1>
        <p className="text-sm text-foreground/55">
          Examen blanc ТРКИ-1, vocabulaire minimum B1 et suivi de progression — le tableau de bord
          complet arrive au fil de la construction du module.
        </p>
      </div>
      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Examens blancs</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Génère et passe un sujet ТРКИ-1 (Лексика · Грамматика pour l’instant).
        </p>
        <Link href="/objectif-b1/examens" className="mt-3 inline-block text-primary hover:underline">
          Aller aux examens →
        </Link>
      </div>
    </div>
  );
}
