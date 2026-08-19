import Link from "next/link";
import { ArrowRight, GraduationCap, Languages, Repeat, RotateCcw } from "lucide-react";
import { currentUserId } from "@/lib/auth";
import { dueReviewCount } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exercices · Русский" };

export default async function ExercicesPage() {
  const userId = await currentUserId();
  const due = await dueReviewCount(userId);

  const cards = [
    {
      href: "/exercices/reviser",
      icon: Repeat,
      title: "Réviser",
      desc:
        due > 0
          ? `${due} forme${due > 1 ? "s" : ""} à revoir maintenant, plus les nouvelles à découvrir.`
          : "Rappels espacés et nouvelles formes, mélangés dans une seule file.",
    },
    {
      href: "/exercices/apprendre",
      icon: GraduationCap,
      title: "Apprendre",
      desc:
        "Une classe à la fois : déclinaisons et conjugaisons par essai-erreur, irréguliers par cœur.",
    },
    {
      href: "/exercices/traduire",
      icon: Languages,
      title: "Traduire",
      desc: "Vocabulaire pur : la forme du dictionnaire, sans décliner ni conjuguer.",
    },
    {
      href: "/exercices/erreurs",
      icon: RotateCcw,
      title: "Travailler ses erreurs",
      desc: "Uniquement les mots dont la dernière réponse était fausse, jusqu’à les reprendre.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Exercices</h1>
        <p className="mt-1 text-sm text-foreground/55">
          Trois façons de travailler tes mots, selon ce dont tu as besoin aujourd’hui.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {cards.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="glass glass-lift group flex items-center justify-between gap-4 rounded-2xl p-5"
          >
            <div className="flex min-w-0 items-start gap-4">
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl">{title}</h2>
                <p className="mt-0.5 text-sm text-foreground/60">{desc}</p>
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0 text-foreground/35 transition-colors group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
