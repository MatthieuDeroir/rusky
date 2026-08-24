"use client";

import { useEffect, useState, useTransition } from "react";
import { listQuarantinedAction, resolveQuarantineAction, type QuarantineEntry } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function QuarantineView() {
  const [entries, setEntries] = useState<QuarantineEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listQuarantinedAction().then(setEntries);
  }, []);

  function resolve(id: number, keep: boolean) {
    startTransition(async () => {
      await resolveQuarantineAction(id, keep);
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? null);
    });
  }

  if (entries === null) return <p className="text-sm text-foreground/50">Chargement…</p>;
  if (entries.length === 0) return <p className="text-sm text-foreground/50">Rien en quarantaine 🎉</p>;

  return (
    <ul className="space-y-4">
      {entries.map((e) => (
        <li key={e.id} className="glass-strong rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{e.typeId}</Badge>
            <span className="text-xs text-foreground/45">{e.targetId}</span>
          </div>
          <p className="mt-2 text-lg">{e.stem}</p>
          <ul className="mt-2 space-y-0.5 text-sm text-foreground/70">
            {e.options.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-foreground/45">Trace de validation</summary>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-black/20 p-2 text-xs text-foreground/60">
              {JSON.stringify(e.validatedBy, null, 2)}
            </pre>
          </details>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => resolve(e.id, true)}>
              Garder
            </Button>
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => resolve(e.id, false)}>
              Rejeter
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
