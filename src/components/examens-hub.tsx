"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  createExamPaperAction,
  getPaperStatusAction,
  listPapersAction,
  type PaperListEntry,
} from "@/app/objectif-b1/actions";
import { SUBTEST_LABELS, type SubtestCode } from "@/lib/exam/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const AVAILABLE_SUBTESTS: SubtestCode[] = ["lexgram"]; // les autres arrivent M2-M5

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente…",
  GENERATING: "Génération en cours…",
  READY: "Prêt",
  FAILED: "Échec",
};

export function ExamensHub() {
  const [selected, setSelected] = useState<Set<SubtestCode>>(new Set(AVAILABLE_SUBTESTS));
  const [papers, setPapers] = useState<PaperListEntry[]>([]);
  const [isCreating, startCreate] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setPapers(await listPapersAction());
  }, []);

  useEffect(() => {
    listPapersAction().then(setPapers);
  }, []);

  useEffect(() => {
    const pending = papers.some((p) => p.status === "PENDING" || p.status === "GENERATING");
    if (!pending) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const stillPending = papers.filter((p) => p.status === "PENDING" || p.status === "GENERATING");
      for (const p of stillPending) {
        const status = await getPaperStatusAction(p.id);
        if (status && status.status !== p.status) {
          if (status.status === "READY") toast.success("Sujet prêt !");
          if (status.status === "FAILED") toast.error(status.error ?? "Échec de la génération.");
          await refresh();
          break;
        }
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [papers, refresh]);

  function toggle(subtest: SubtestCode) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(subtest)) next.delete(subtest);
      else next.add(subtest);
      return next;
    });
  }

  function create() {
    if (selected.size === 0) return;
    startCreate(async () => {
      await createExamPaperAction({ subtests: [...selected] });
      await refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Préparer un sujet</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Choisis un ou plusieurs sous-tests — le sujet est généré en arrière-plan, tu peux
          continuer à naviguer pendant ce temps.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(SUBTEST_LABELS) as SubtestCode[]).map((s) => {
            const available = AVAILABLE_SUBTESTS.includes(s);
            const active = selected.has(s);
            return (
              <button
                key={s}
                type="button"
                disabled={!available}
                onClick={() => toggle(s)}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                  !available
                    ? "cursor-not-allowed bg-white/5 text-foreground/30"
                    : active
                      ? "bg-primary/40 text-foreground"
                      : "bg-white/5 text-foreground/60 hover:text-foreground"
                }`}
              >
                {SUBTEST_LABELS[s]}
                {!available && " · bientôt"}
              </button>
            );
          })}
        </div>
        <Button className="mt-4" disabled={isCreating || selected.size === 0} onClick={create}>
          {isCreating ? "Préparation…" : "Préparer un nouveau sujet"}
        </Button>
      </div>

      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Historique</h2>
        {papers.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">Aucun sujet généré pour l’instant.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {papers.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {p.subtests.map((s) => SUBTEST_LABELS[s]).join(" · ")}
                  </span>
                  <span className="ml-2 text-foreground/45">
                    {new Date(p.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{STATUS_LABEL[p.status] ?? p.status}</Badge>
                  {p.status === "READY" && (
                    <Link
                      href={`/objectif-b1/examens/${p.id}/${p.subtests[0]}`}
                      className="text-primary hover:underline"
                    >
                      Passer →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
