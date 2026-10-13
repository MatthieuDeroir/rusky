import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSections, getLayout } from "@/lib/grammar";
import { accent, shortGloss } from "@/lib/learn";
import { wordMeta } from "@/components/ui";
import { WordStatus } from "@/components/word-status";
import { BackLink } from "@/components/back-link";

export const dynamic = "force-dynamic";

async function load(id: number) {
  return prisma.dictionaryEntry.findUnique({ where: { id }, include: { forms: { orderBy: { variantIndex: "asc" } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await load(Number((await params).id));
  return { title: e ? e.bare : "Mot" };
}

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

export default async function WordPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  const id = Number((await params).id);
  const e = Number.isInteger(id) ? await load(id) : null;
  if (!e) notFound();
  const word = await prisma.word.findUnique({ where: { userId_entryId: { userId, entryId: id } } });

  const byKey = new Map<string, string[]>();
  for (const f of e.forms) byKey.set(f.formKey, [...(byKey.get(f.formKey) ?? []), accent(f.accented)]);
  const sections = buildSections(getLayout([...byKey.keys()]))
    .map((s) => ({ ...s, rows: s.rows.filter((r) => r.cells.some((c) => c && byKey.has(c))) }))
    .filter((s) => s.rows.length > 0);

  const status = !word
    ? e.b1Rank !== null
      ? `Pas encore vu — n° ${e.b1Rank + 1} du parcours B1.`
      : "Hors du lexique B1."
    : word.status === "KNOWN"
      ? `Connu. Prochaine vérification le ${fmt.format(word.dueAt)}.`
      : `En cours d’apprentissage. Prochaine révision le ${fmt.format(word.dueAt)}.`;

  return (
    <div className="space-y-8">
      <BackLink label="Mots" fallback="/mots" />

      <header className="space-y-2">
        <h1 className="ru text-[38px] leading-tight break-words sm:text-[48px]">{accent(e.accented)}</h1>
        <p className="text-muted">
          {wordMeta(e)}
          {e.partner ? <> · partenaire : <span className="ru text-ink">{accent(e.partner)}</span></> : null}
        </p>
        <p className="text-[21px] font-medium sm:text-[24px]">{shortGloss(e)}</p>
        <p className="text-[15px] text-muted">{status}</p>
        <div className="pt-2">
          <WordStatus key={word?.status ?? "none"} entryId={e.id} status={word?.status ?? null} size="md" />
        </div>
      </header>

      {(e.exampleRu || word?.context) && (
        <section className="space-y-3">
          {word?.context && (
            <figure className="space-y-1">
              <blockquote className="ru text-[18px] sm:text-[20px]">{word.context}</blockquote>
              {word.source && <figcaption className="text-[14px] text-faint">Rencontré dans {word.source}</figcaption>}
            </figure>
          )}
          {e.exampleRu && (
            <figure className="space-y-1">
              <blockquote className="ru text-[18px] sm:text-[20px]">{e.exampleRu}</blockquote>
              {e.exampleFr && <figcaption className="text-muted">{e.exampleFr}</figcaption>}
            </figure>
          )}
        </section>
      )}

      {e.translationsFr && e.glossFr && (
        <p className="text-[15px] text-muted">Autres sens du dictionnaire : {e.translationsFr}</p>
      )}

      {sections.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-[19px] font-semibold">{s.title}</h2>
          <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse text-left">
            {s.columns.length > 0 && (
              <thead>
                <tr className="text-[14px] text-muted">
                  <th className="py-1 pr-3 font-normal" />
                  {s.columns.map((c) => (
                    <th key={c} className="py-1 pr-2 font-normal sm:pr-3">
                      <Label full={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <th scope="row" className="py-2 pr-2 text-[14px] font-normal whitespace-nowrap text-muted sm:pr-3">
                    <Label full={r.label} />
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={i} className="ru py-2 pr-2 text-[16px] sm:pr-3 sm:text-[18px]">
                      {(c && byKey.get(c)?.join(", ")) || <span className="text-faint">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ))}
    </div>
  );
}

// Libellés courts sur mobile : les tableaux à 4 colonnes (adjectifs) tiennent dans l'écran.
const SHORT: Record<string, string> = {
  Nominatif: "Nom.",
  Génitif: "Gén.",
  Datif: "Dat.",
  Accusatif: "Acc.",
  Instrumental: "Instr.",
  Prépositionnel: "Prép.",
  Masculin: "Masc.",
  Féminin: "Fém.",
  Neutre: "Neutre",
  Pluriel: "Plur.",
  Singulier: "Sing.",
  "он/она/оно (il/elle)": "он/она́",
  "они (ils/elles)": "они́",
};

function Label({ full }: { full: string }) {
  const short = SHORT[full];
  if (!short) return <>{full}</>;
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}
