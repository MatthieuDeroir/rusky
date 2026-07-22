"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Shapes } from "lucide-react";
import { toast } from "sonner";
import {
  displayAccent,
  normalizeBare,
  normalizeFr,
  WORD_TYPE_LABELS,
  type WordType,
} from "@/lib/grammar";
import type { CollectionItem } from "@/lib/queries";
import { deleteWordAction } from "@/app/actions";
import { ProgressRing } from "@/components/progress-ring";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";

const TYPE_ORDER: WordType[] = [
  "noun",
  "verb",
  "adjective",
  "pronoun",
  "numeral",
  "other",
];

type Filter = WordType | "all";

interface TypeStat {
  type: WordType;
  count: number;
  discovered: number;
  total: number;
}

type Sort = "alpha" | "recent";

export function CollectionView({ items }: { items: CollectionItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("alpha");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<CollectionItem | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();

  const confirmDelete = () => {
    const target = pending;
    if (!target) return;
    startDelete(async () => {
      try {
        await deleteWordAction(target.id);
        toast.success(`« ${displayAccent(target.accented)} » supprimé.`);
        setPending(null);
        router.refresh();
      } catch {
        toast.error("Échec de la suppression.");
      }
    });
  };

  const { stats, overall } = useMemo(() => {
    const map = new Map<WordType, TypeStat>();
    let dAll = 0;
    let tAll = 0;
    for (const it of items) {
      const s = map.get(it.type) ?? { type: it.type, count: 0, discovered: 0, total: 0 };
      s.count += 1;
      s.discovered += it.discovered;
      s.total += it.total;
      map.set(it.type, s);
      dAll += it.discovered;
      tAll += it.total;
    }
    const stats = TYPE_ORDER.filter((t) => map.has(t)).map((t) => map.get(t)!);
    return { stats, overall: { discovered: dAll, total: tAll } };
  }, [items]);

  const q = query.trim();
  const qBare = normalizeBare(q); // matches the Russian word
  const qFr = normalizeFr(q); // matches the French translation
  const matchesSearch = (it: CollectionItem) =>
    !q ||
    normalizeBare(it.bare).includes(qBare) ||
    (!!it.translationsFr && normalizeFr(it.translationsFr).includes(qFr));

  const bySort = (a: CollectionItem, b: CollectionItem) =>
    sort === "recent" ? b.firstSeen - a.firstSeen : a.bare.localeCompare(b.bare, "ru");

  const shown = items
    .filter((it) => filter === "all" || it.type === filter)
    .filter(matchesSearch);
  const shownGrouped = TYPE_ORDER.filter((t) => shown.some((i) => i.type === t)).map(
    (t) => [t, shown.filter((i) => i.type === t).sort(bySort)] as const,
  );

  return (
    <div className="space-y-8">
      {/* Per-type completion gauges (click to filter) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <TypeGauge
          label="Tout"
          count={items.length}
          discovered={overall.discovered}
          total={overall.total}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {stats.map((s) => (
          <TypeGauge
            key={s.type}
            label={`${WORD_TYPE_LABELS[s.type]}s`}
            count={s.count}
            discovered={s.discovered}
            total={s.total}
            active={filter === s.type}
            onClick={() => setFilter(s.type)}
          />
        ))}
      </div>

      {/* Search (French or Russian) + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (français ou русский)…"
          autoComplete="off"
          spellCheck={false}
          className="h-11 flex-1 border-white/15 bg-white/5"
        />
        <div className="flex h-11 shrink-0 items-center rounded-xl bg-white/5 p-1 text-sm ring-1 ring-white/10">
          {(
            [
              ["alpha", "A→Я"],
              ["recent", "Récents"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                sort === key
                  ? "bg-white/15 text-foreground"
                  : "text-foreground/55 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {q && shown.length === 0 && (
        <p className="text-center text-sm text-foreground/50">
          Aucun mot pour « {q} ».
        </p>
      )}

      {/* Filtered, grouped word rows — compact, dense list */}
      {shownGrouped.map(([type, list]) => (
        <section key={type} className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground/45">
            {WORD_TYPE_LABELS[type]}s · {list.length}
          </h2>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((it) => (
              <div key={it.id} className="group relative min-w-0">
                <Link
                  href={`/word/${it.id}`}
                  className="glass glass-lift flex items-center gap-2 rounded-xl py-2 pl-3 pr-2.5 hover:bg-white/10"
                >
                  <span className="shrink-0 font-display text-lg leading-none">
                    {displayAccent(it.accented)}
                  </span>
                  {it.translationsFr && (
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground/50">
                      {it.translationsFr}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 pl-1">
                    {it.total > 0 ? (
                      <span className="text-xs tabular-nums text-foreground/45 group-hover:opacity-0">
                        {it.discovered}/{it.total}
                      </span>
                    ) : (
                      <span className="text-[10px] text-foreground/35 group-hover:opacity-0">
                        invar.
                      </span>
                    )}
                  </span>
                </Link>
                {/* Delete appears on hover, over the progress counter. */}
                <button
                  type="button"
                  onClick={() => setPending(it)}
                  aria-label={`Supprimer ${it.bare}`}
                  title="Supprimer de ma collection"
                  className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg bg-[oklch(0.17_0.03_280)]/80 text-foreground/45 opacity-0 backdrop-blur-sm transition-all hover:bg-destructive/25 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      <ConfirmDialog
        open={pending !== null}
        destructive
        busy={isDeleting}
        title="Supprimer ce mot ?"
        description={
          pending && (
            <>
              «&nbsp;<span className="font-medium text-foreground">{displayAccent(pending.accented)}</span>&nbsp;»
              sera retiré de ta collection, avec ses cases découvertes et son historique de
              quiz. Le dictionnaire de référence n’est pas touché. Cette action est définitive.
            </>
          )
        }
        confirmLabel="Supprimer"
        onConfirm={confirmDelete}
        onCancel={() => !isDeleting && setPending(null)}
      />
    </div>
  );
}

// A per-type filter gauge: the paradigm-completion % in the ring, the word count below.
// Invariables have no paradigm, so they show an icon instead of an empty 0/0 ring.
function TypeGauge({
  label,
  count,
  discovered,
  total,
  active,
  onClick,
}: {
  label: string;
  count: number;
  discovered: number;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  const hasForms = total > 0;
  const pct = hasForms ? Math.round((discovered / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass glass-lift flex items-center gap-3 rounded-2xl p-3.5 text-left ${
        active ? "ring-2 ring-primary/70" : ""
      }`}
    >
      {hasForms ? (
        <ProgressRing value={discovered} total={total} size={46} label={`${pct}%`} />
      ) : (
        <span className="grid size-[46px] shrink-0 place-items-center rounded-full bg-white/5 text-foreground/35 ring-1 ring-white/10">
          <Shapes className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium">{label}</div>
        <div className="text-xs text-foreground/50">
          {count} mot{count > 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}
