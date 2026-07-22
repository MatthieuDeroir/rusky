import Link from "next/link";
import { notFound } from "next/navigation";
import { getWordDetail, getWordNeighbors } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";
import { displayAccent, describeFormKey, WORD_TYPE_LABELS } from "@/lib/grammar";
import { ParadigmTable } from "@/components/paradigm-table";
import { ProgressRing } from "@/components/progress-ring";
import { TranslationEditor } from "@/components/translation-editor";
import { BackButton } from "@/components/back-button";
import { SpeakButton } from "@/components/speak-button";
import { Badge } from "@/components/ui/badge";

export default async function WordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { id } = await params;
  const { theme } = await searchParams;
  const userId = await currentUserId();
  const word = await getWordDetail(Number(id), userId);
  if (!word) notFound();

  const { prevId, nextId } = await getWordNeighbors(Number(id), userId, theme);
  const q = theme ? `?theme=${theme}` : "";

  const meta: string[] = [];
  if (word.gender)
    meta.push({ m: "masculin", f: "féminin", n: "neutre" }[word.gender] ?? word.gender);
  if (word.aspect)
    meta.push(word.aspect === "imperfective" ? "imperfectif" : "perfectif");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-2">
          {prevId ? (
            <Link
              href={`/word/${prevId}${q}`}
              className="glass rounded-lg px-3 py-1.5 text-sm hover:bg-white/10"
            >
              ← Précédent
            </Link>
          ) : (
            <span className="rounded-lg px-3 py-1.5 text-sm text-foreground/25">← Précédent</span>
          )}
          {nextId ? (
            <Link
              href={`/word/${nextId}${q}`}
              className="glass rounded-lg px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Suivant →
            </Link>
          ) : (
            <span className="rounded-lg px-3 py-1.5 text-sm text-foreground/25">Suivant →</span>
          )}
        </div>
      </div>

      <header className="glass-strong flex items-center justify-between rounded-3xl p-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold">
              {displayAccent(word.accented)}
              {word.pluralHeadword && (
                <span className="text-foreground/45">
                  {" / "}
                  {displayAccent(word.pluralHeadword)}
                </span>
              )}
            </h1>
            <SpeakButton
              text={word.accented}
              className="size-9 bg-white/8 hover:bg-white/15 [&_svg]:size-5"
            />
            <Badge variant="secondary" className="bg-white/10">
              {WORD_TYPE_LABELS[word.type]}
            </Badge>
          </div>
          <TranslationEditor entryId={word.id} initialFr={word.translationsFr} />
          <div className="flex flex-wrap gap-2 text-xs text-foreground/55">
            {meta.map((m) => (
              <span key={m} className="rounded-full bg-white/8 px-2.5 py-1">
                {m}
              </span>
            ))}
            {word.partner && (
              <span className="rounded-full bg-white/8 px-2.5 py-1">
                partenaire : {displayAccent(word.partner)}
              </span>
            )}
            {word.comparative && (
              <span className="rounded-full bg-white/8 px-2.5 py-1">
                comparatif : {displayAccent(word.comparative)}
              </span>
            )}
          </div>
        </div>
        {word.total > 0 && <ProgressRing value={word.discovered} total={word.total} size={64} />}
      </header>

      {word.total > 0 ? (
        <ParadigmTable sections={word.sections} entryId={word.id} />
      ) : (
        <div className="glass rounded-2xl p-6 text-center text-foreground/60">
          Ce mot est invariable — il n’a pas de tableau de formes.
        </div>
      )}

      {word.encounters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground/70">
            Rencontres ({word.encounters.length})
          </h2>
          <div className="space-y-2">
            {word.encounters.map((e) => (
              <div
                key={e.id}
                className="glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm"
              >
                <span className="font-medium">{e.rawInput}</span>
                {e.matchedFormKey && (
                  <Badge variant="secondary" className="bg-white/10 text-xs">
                    {describeFormKey(e.matchedFormKey)}
                  </Badge>
                )}
                {e.source && (
                  <span className="text-foreground/55">· {e.source}</span>
                )}
                {e.context && (
                  <span className="italic text-foreground/50">“{e.context}”</span>
                )}
                <span className="ml-auto text-xs text-foreground/40">
                  {e.createdAt.toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
