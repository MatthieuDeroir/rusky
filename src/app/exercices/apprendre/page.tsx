import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { getLearnScopesAction } from "@/app/actions";
import { allScopes, GROUP_LABEL, type ScopeGroup } from "@/lib/learn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apprendre · Русский" };

const GROUP_ORDER: ScopeGroup[] = ["declension", "conjugation", "irregular"];

export default async function ApprendrePage() {
  const availability = await getLearnScopesAction();
  const byKey = new Map(availability.map((a) => [a.key, a]));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BackButton />
      <div>
        <h1 className="font-display text-3xl">Apprendre</h1>
        <p className="mt-1 text-sm text-foreground/55">
          Une classe à la fois. Pour les formes régulières tu devines d’abord, la règle vient
          après ton erreur. Les irréguliers, eux, se matraquent.
        </p>
      </div>

      {GROUP_ORDER.map((group) => {
        const scopes = allScopes().filter((s) => s.group === group);
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/40">
              {GROUP_LABEL[group]}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {scopes.map((scope) => {
                const a = byKey.get(scope.key);
                const words = a?.words ?? 0;
                const remaining = a?.remaining ?? 0;
                const total = a?.total ?? 0;
                const locked = words === 0;

                const body = (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="min-w-0 font-medium">{scope.label}</h3>
                      {!locked && (
                        <ArrowRight className="size-4 shrink-0 text-foreground/35 transition-colors group-hover:text-primary" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-foreground/50">{scope.blurb}</p>
                    <p className="mt-2 text-[11px] text-foreground/40">
                      {locked
                        ? "Aucun mot de cette catégorie dans ta collection"
                        : scope.mode === "rote"
                          ? `${words} mot${words > 1 ? "s" : ""} · ${total} forme${total > 1 ? "s" : ""} à savoir par cœur`
                          : `${words} mot${words > 1 ? "s" : ""} · ${remaining}/${total} forme${total > 1 ? "s" : ""} à découvrir`}
                    </p>
                  </>
                );

                if (locked) {
                  return (
                    <div
                      key={scope.key}
                      className="rounded-2xl bg-white/[0.03] p-4 opacity-55 ring-1 ring-white/10"
                    >
                      {body}
                    </div>
                  );
                }
                return (
                  <Link
                    key={scope.key}
                    href={`/exercices/apprendre/${scope.key}`}
                    className="glass glass-lift group rounded-2xl p-4"
                  >
                    {body}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
