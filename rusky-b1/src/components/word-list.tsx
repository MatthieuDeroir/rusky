"use client";

import Link from "next/link";
import { useState } from "react";
import { WordStatus } from "@/components/word-status";

export interface WordRow {
  id: number;
  ru: string;
  gloss: string;
  inB1: boolean;
  status: string | null;
}

/** Liste figée tant qu'on reste sur la page : un clic « connu / à apprendre » ne fait ni
 * disparaître ni remonter les lignes (sinon on clique sur le mauvais mot en triant vite).
 * Les statuts, eux, suivent les données à jour. */
export function WordList({ rows }: { rows: WordRow[] }) {
  const [frozen] = useState(rows);
  const latest = new Map(rows.map((r) => [r.id, r.status]));
  return (
    <ul className="divide-y divide-line">
      {frozen.map((r) => {
        const st = latest.has(r.id) ? latest.get(r.id)! : r.status;
        return (
          <li key={r.id} className="flex items-center gap-2 py-1.5">
            <Link href={`/mots/${r.id}`} className="flex min-w-0 flex-1 items-baseline gap-3 rounded-lg py-1 hover:bg-sunk/60">
              <span className="ru shrink-0 text-[20px]">{r.ru}</span>
              <span className="truncate text-muted">{r.gloss}</span>
              {!r.inB1 && <span className="ml-auto shrink-0 text-[13px] text-faint">hors B1</span>}
            </Link>
            <WordStatus key={`${r.id}-${st ?? "none"}`} entryId={r.id} status={st} />
          </li>
        );
      })}
    </ul>
  );
}
