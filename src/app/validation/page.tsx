import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { getCollection } from "@/lib/queries";
import { getPassedTasks } from "@/lib/torfl-store";
import { currentUserId } from "@/lib/auth";
import { recommendExam, type LearnerProfile } from "@/lib/mistral";
import { TORFL, BAND_META, BAND_ORDER, levelValidated } from "@/lib/torfl";

export const dynamic = "force-dynamic";

const DECLINING = new Set(["noun", "adjective", "pronoun", "numeral"]);

export default async function ValidationPage() {
  const userId = await currentUserId();
  const items = await getCollection(userId);
  const passed = await getPassedTasks(userId);

  // Build the learner profile (computed only here = when the tab is opened).
  const wordsByType: Record<string, number> = {};
  let decl = 0;
  let conj = 0;
  for (const i of items) {
    wordsByType[i.type] = (wordsByType[i.type] ?? 0) + 1;
    if (i.type === "verb") conj += i.discovered;
    else if (DECLINING.has(i.type)) decl += i.discovered;
  }
  const profile: LearnerProfile = {
    totalWords: items.length,
    wordsByType,
    declensionForms: decl,
    conjugationForms: conj,
    passedLevels: TORFL.filter((l) => levelValidated(l, passed)).map((l) => l.cefr),
  };

  const reco =
    items.length > 0
      ? await recommendExam(userId, profile)
      : {
          available: false,
          message: "Ajoute des mots à ta collection pour obtenir une recommandation d’examens.",
          recommended: [] as string[],
        };
  const recommended = new Set(reco.recommended);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Validation · TORFL (ТРКИ)</h1>
        <p className="text-sm text-foreground/55">
          Les 6 niveaux officiels, découpés en sous-niveaux. Les épreuves de production (écrit /
          oral) sont corrigées par l’IA.
        </p>
      </div>

      {/* Recommendation computed on opening the tab */}
      <section className="glass-strong rounded-3xl p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/70">
          <Sparkles className="size-4 text-primary" />
          Recommandation
        </div>
        <p className="mt-2 text-sm text-foreground/80">{reco.message}</p>
        {reco.recommended.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {reco.recommended.map((id) => (
              <Link
                key={id}
                href={`/validation/${id}`}
                className="rounded-lg bg-primary/25 px-3 py-1.5 text-sm ring-1 ring-primary/40 transition-colors hover:bg-primary/35"
              >
                Tenter {id} →
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Bands → CEFR levels → sub-levels */}
      <div className="space-y-8">
        {BAND_ORDER.map((band) => (
          <div key={band} className="space-y-4">
            <div>
              <h2 className="font-display text-2xl">{BAND_META[band].title}</h2>
              <p className="text-sm text-foreground/55">{BAND_META[band].blurb}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {TORFL.filter((b) => b.band === band).map((level) => {
                const ok = levelValidated(level, passed);
                const reco = recommended.has(level.cefr);
                const donePassed = level.tasks.filter((t) => passed.has(t.id)).length;
                return (
                  <Link
                    key={level.cefr}
                    href={`/validation/${level.cefr}`}
                    className={`flex items-center justify-between gap-2 rounded-2xl px-5 py-4 ring-1 transition-colors ${
                      ok
                        ? "bg-emerald-500/15 ring-emerald-400/40 hover:bg-emerald-500/20"
                        : reco
                          ? "bg-primary/15 ring-primary/40 hover:bg-primary/25"
                          : "glass ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="font-display text-lg">{level.title}</span>
                      <span className="block text-sm text-foreground/55">{level.subtitle}</span>
                      <span className="mt-1 block text-xs text-foreground/35">
                        {donePassed}/{level.tasks.length} épreuves
                      </span>
                    </span>
                    {ok ? (
                      <Check className="size-5 shrink-0 text-emerald-300" />
                    ) : reco ? (
                      <span className="shrink-0 text-xs text-primary">conseillé</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
