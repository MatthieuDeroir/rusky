import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { PasteText } from "@/components/reader/paste-text";
import { DeleteTextButton } from "@/components/reader/delete-text-button";
import type { ReaderAnswer } from "@/lib/reader/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lire · Русский" };

const SOURCE_LABEL: Record<string, string> = {
  pasted: "Collé",
  generated: "Généré",
  lesson: "Leçon",
  corpus: "Corpus",
};

export default async function LirePage() {
  const userId = await currentUserId();
  const texts = await prisma.readingText.findMany({
    // Les phrases-clés des unités et les phrases à décortiquer vivent dans leurs propres écrans.
    // (purpose est nullable : un simple NOT exclurait aussi les NULL en SQL.)
    where: {
      AND: [
        { OR: [{ userId }, { userId: null }] },
        { source: { not: "lesson" } },
        { OR: [{ purpose: null }, { purpose: { not: "decode" } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      title: true,
      source: true,
      status: true,
      body: true,
      createdAt: true,
      progress: { where: { userId }, select: { completedAt: true, answers: true } },
    },
  });

  const mine = texts.filter((t) => t.source !== "corpus");
  const corpus = texts
    .filter((t) => t.source === "corpus")
    .sort((a, b) => a.body.split(/\s+/).length - b.body.split(/\s+/).length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Lire</h1>
        <p className="text-sm text-foreground/55">
          Lis d’abord sans aide. Touche un mot pour comprendre sa forme, active « Structure » pour voir qui fait
          quoi à qui.
        </p>
      </div>

      <PasteText />

      {[
        { title: "Tes textes", list: mine, hint: null },
        {
          title: "Corpus — Tolstoï, récits pour enfants",
          list: corpus,
          hint: "Textes authentiques (1875), du plus court au plus long : fables, contes, petites histoires vraies.",
        },
      ].map(({ title, list, hint }) =>
        list.length === 0 ? null : (
        <section key={title} className="space-y-3">
          <h2 className="font-display text-xl">{title}</h2>
          {hint && <p className="-mt-2 text-sm text-foreground/50">{hint}</p>}
          <ul className="space-y-2">
            {list.map((t) => {
              const prog = t.progress[0];
              const answers = Object.values(JSON.parse(prog?.answers ?? "{}") as Record<string, ReaderAnswer>);
              const words = t.body.split(/\s+/).length;
              return (
                <li key={t.id} className="glass glass-lift flex items-center gap-3 rounded-2xl p-4">
                  <Link href={`/lire/${t.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg">{t.title}</p>
                    <p className="text-xs text-foreground/50">
                      {SOURCE_LABEL[t.source] ?? t.source} · {words} mots
                      {t.status === "ANALYZING" || t.status === "PENDING" ? " · analyse en cours" : ""}
                      {t.status === "FAILED" ? " · analyse en échec" : ""}
                      {answers.length > 0 &&
                        ` · ${answers.filter((a) => a.correct).length}/${answers.length} questions justes`}
                      {prog?.completedAt ? " · ✓ lu" : ""}
                    </p>
                  </Link>
                  {t.userId === userId && <DeleteTextButton id={t.id} title={t.title} />}
                </li>
              );
            })}
          </ul>
        </section>
        ),
      )}
    </div>
  );
}
