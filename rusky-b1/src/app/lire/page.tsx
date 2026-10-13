import type { Metadata } from "next";
import Link from "next/link";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PasteText } from "@/components/paste-text";
import { GenerateText } from "@/components/generate-text";
import { cn } from "@/lib/utils";
import { rereadSuggestions } from "@/lib/motivation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lire" };

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export default async function ReadPage() {
  const userId = await currentUserId();
  const texts = await prisma.text.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      source: true,
      body: true,
      status: true,
      forDay: true,
      progress: { where: { userId }, select: { completedAt: true, right: true, total: true } },
    },
  });
  const mine = texts.filter((t) => t.source !== "corpus" && t.body);
  const reread = await rereadSuggestions(userId);
  const corpus = texts
    .filter((t) => t.source === "corpus")
    .map((t) => ({ ...t, words: t.body.split(/\s+/).length }))
    .sort((a, b) => a.words - b.words);

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-[32px] font-semibold">Lire</h1>
        <p className="text-muted">
          La lecture compte pour un quart de l’examen. Lis sans aide d’abord, touche un mot seulement si tu bloques.
        </p>
      </header>

      {reread.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[19px] font-semibold">À relire</h2>
          <p className="text-[15px] text-muted">Des textes lus il y a plus d’un mois : relis-les pour mesurer le chemin.</p>
          <ul className="space-y-2">
            {reread.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/lire/${r.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-sunk/60"
                >
                  <span className="ru min-w-0 truncate text-[18px]">{r.title}</span>
                  <span className="shrink-0 text-[15px] text-muted tabular-nums">
                    lu le {fmt.format(r.readOn)} à {r.then} % → <span className="font-semibold text-known">{r.now} %</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[19px] font-semibold">Générer un texte</h2>
        <GenerateText />
      </section>

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[19px] font-semibold">Tes textes</h2>
          <TextList
            items={mine.map((t) => ({
              id: t.id,
              title: t.title,
              meta:
                t.source === "lesson"
                  ? `Leçon, ${t.forDay ? fmt.format(new Date(t.forDay)) : ""}`
                  : t.source === "generated"
                  ? `Texte du jour, ${t.forDay ? fmt.format(new Date(t.forDay)) : ""}`
                  : t.source === "practice"
                    ? "Entraînement, mots connus"
                    : "Texte collé",
              progress: t.progress[0],
              pending: t.status !== "READY",
            }))}
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[19px] font-semibold">Récits de Tolstoï</h2>
        <p className="text-[15px] text-muted">
          Textes authentiques écrits pour apprendre à lire (1875), du plus court au plus long.
        </p>
        <TextList
          items={corpus.map((t) => ({
            id: t.id,
            title: t.title,
            meta: `${t.words} mots`,
            progress: t.progress[0],
            pending: false,
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-[19px] font-semibold">Coller un texte</h2>
        <PasteText />
      </section>
    </div>
  );
}

function TextList({
  items,
}: {
  items: { id: number; title: string; meta: string; progress?: { completedAt: Date | null; right: number; total: number }; pending: boolean }[];
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => (
        <li key={t.id}>
          <Link href={`/lire/${t.id}`} className="flex items-center gap-3 py-3 hover:bg-sunk/60">
            <span className="min-w-0 flex-1">
              <span className="ru block truncate text-[19px]">{t.title}</span>
              <span className="block text-[14px] text-muted">
                {t.meta}
                {t.pending ? ", en préparation" : ""}
              </span>
            </span>
            {t.progress?.completedAt && (
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[14px] tabular-nums", "bg-known-soft text-known")}>
                {t.progress.total ? `${t.progress.right}/${t.progress.total}` : "lu"}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
