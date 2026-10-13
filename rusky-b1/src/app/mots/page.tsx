import type { Metadata } from "next";
import Link from "next/link";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeBare } from "@/lib/grammar";
import { accent, shortGloss } from "@/lib/learn";
import { cn } from "@/lib/utils";
import { WordList } from "@/components/word-list";
import { RememberList } from "@/components/back-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mots" };

const FILTERS = [
  { id: "all", label: "Tout le lexique" },
  { id: "known", label: "Connus" },
  { id: "learning", label: "En cours" },
  { id: "todo", label: "À venir" },
] as const;
const PAGE = 120;

export default async function WordsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; after?: string; before?: string }> }) {
  const userId = await currentUserId();
  const sp = await searchParams;
  const f = FILTERS.some((x) => x.id === sp.f) ? sp.f! : "all";
  const q = (sp.q ?? "").trim();
  // Pagination par rang dans le parcours (pas par numéro de page) : marquer des mots les fait
  // sortir du filtre, et un décalage de page en ferait sauter. « Suivants » reprend juste après le
  // dernier mot affiché, quoi qu'on ait marqué entre-temps.
  const after = sp.after !== undefined && /^\d+$/.test(sp.after) ? Number(sp.after) : null;
  const before = sp.before !== undefined && /^\d+$/.test(sp.before) ? Number(sp.before) : null;
  let hasPrev = false;
  let hasNext = false;

  const select = {
    id: true,
    accented: true,
    type: true,
    glossFr: true,
    translationsFr: true,
    translationsEn: true,
    b1Rank: true,
    words: { where: { userId }, select: { status: true } },
  } as const;

  let rows;
  let total = 0;
  if (q) {
    // Recherche : forme fléchie russe (via l'index des formes) ou début du mot, ou sens français.
    const norm = normalizeBare(q);
    const isRu = /[а-я]/.test(norm);
    const formIds = isRu
      ? (await prisma.dictionaryForm.findMany({ where: { bareForm: norm }, select: { entryId: true }, take: 40 })).map((x) => x.entryId)
      : [];
    rows = await prisma.dictionaryEntry.findMany({
      where: isRu
        ? { OR: [{ id: { in: formIds } }, { bare: { startsWith: norm } }] }
        : { OR: [{ glossFr: { contains: q } }, { translationsFr: { contains: q } }] },
      orderBy: [{ b1Rank: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: 60,
      select,
    });
    total = rows.length;
  } else {
    const where = {
      b1Rank: { not: null },
      ...(f === "known" ? { words: { some: { userId, status: "KNOWN" } } } : {}),
      ...(f === "learning" ? { words: { some: { userId, status: "LEARNING" } } } : {}),
      ...(f === "todo" ? { words: { none: { userId } } } : {}),
    };
    [rows, total] = await Promise.all([
      before !== null
        ? prisma.dictionaryEntry
            .findMany({ where: { ...where, b1Rank: { lt: before } }, orderBy: { b1Rank: "desc" }, take: PAGE, select })
            .then((r) => r.reverse())
        : prisma.dictionaryEntry.findMany({
            where: { ...where, b1Rank: { gt: after ?? -1 } },
            orderBy: { b1Rank: "asc" },
            take: PAGE,
            select,
          }),
      prisma.dictionaryEntry.count({ where }),
    ]);
    if (rows.length) {
      const first = rows[0].b1Rank!;
      const last = rows[rows.length - 1].b1Rank!;
      [hasPrev, hasNext] = await Promise.all([
        prisma.dictionaryEntry.count({ where: { ...where, b1Rank: { lt: first } } }).then((n) => n > 0),
        prisma.dictionaryEntry.count({ where: { ...where, b1Rank: { gt: last } } }).then((n) => n > 0),
      ]);
    }
  }

  const href = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== "all") u.set(k, String(v));
    const s = u.toString();
    return s ? `/mots?${s}` : "/mots";
  };

  return (
    <div className="space-y-6">
      <RememberList />
      <h1 className="text-[32px] font-semibold">Mots</h1>

      <form action="/mots" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Chercher un mot russe (même fléchi) ou un sens français"
          className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-4 text-[17px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_2px_var(--cobalt)]"
          autoComplete="off"
          lang="ru"
        />
      </form>

      {!q && (
        <nav className="flex flex-wrap gap-2" aria-label="Filtrer">
          {FILTERS.map((x) => (
            <Link
              key={x.id}
              href={href({ f: x.id })}
              aria-current={f === x.id ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[15px]",
                f === x.id ? "bg-ink text-paper" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink",
              )}
            >
              {x.label}
            </Link>
          ))}
        </nav>
      )}

      <p className="text-[15px] text-muted">
        {q ? `${total} résultat${total > 1 ? "s" : ""} pour « ${q} »` : `${total} mots, dans l’ordre d’apprentissage (les plus fréquents d’abord)`}.
        {" "}✓ = je connais, ↺ = à apprendre (arrive dans les révisions).
      </p>

      {rows.length === 0 ? (
        <p className="text-muted">{q ? "Aucun mot trouvé. Essaie la forme du dictionnaire ou un autre sens." : "Aucun mot dans cette liste pour l’instant."}</p>
      ) : (
        <WordList
          key={`${f}-${q}-${after}-${before}`}
          rows={rows.map((e) => ({
            id: e.id,
            ru: accent(e.accented),
            gloss: shortGloss(e),
            inB1: e.b1Rank !== null,
            status: e.words[0]?.status ?? null,
          }))}
        />
      )}

      {!q && rows.length > 0 && (hasPrev || hasNext) && (
        <div className="flex items-center justify-between gap-3">
          {hasPrev ? (
            <Link href={href({ f, before: rows[0].b1Rank! })} className="text-cobalt">
              Précédents
            </Link>
          ) : (
            <span />
          )}
          <span className="text-center text-[15px] text-muted tabular-nums">
            n° {rows[0].b1Rank! + 1} à {rows[rows.length - 1].b1Rank! + 1} du parcours
          </span>
          {hasNext ? (
            <Link href={href({ f, after: rows[rows.length - 1].b1Rank! })} className="text-cobalt">
              Suivants
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
