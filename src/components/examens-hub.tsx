"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  createExamPaperAction,
  getPaperStatusAction,
  listPapersAction,
  type PaperListEntry,
} from "@/app/objectif-b1/actions";
import { SUBTEST_LABELS, type SubtestCode } from "@/lib/exam/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const AVAILABLE_SUBTESTS: SubtestCode[] = ["lexgram", "speaking"]; // reading/writing/listening arrivent M3-M5

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente…",
  GENERATING: "Génération en cours…",
  READY: "Prêt",
  FAILED: "Échec",
};

/** Barre de progression stylée : indéterminée (pulse) tant que totalSlots n'est pas connu,
 * puis pourcentage réel une fois la génération commencée. */
function GenerationProgress({ resolvedSlots, totalSlots }: { resolvedSlots: number; totalSlots: number | null }) {
  if (!totalSlots) {
    return (
      <div className="mt-2 h-2 w-48 max-w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
      </div>
    );
  }
  const pct = Math.min(100, Math.round((resolvedSlots / totalSlots) * 100));
  return (
    <div className="mt-2 w-48 max-w-full">
      <div className="flex items-center justify-between text-xs tabular-nums text-foreground/50">
        <span>
          {resolvedSlots}/{totalSlots} items
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

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
      const updates = await Promise.all(stillPending.map((p) => getPaperStatusAction(p.id)));
      let terminal = false;
      for (const status of updates) {
        if (!status) continue;
        const prev = stillPending.find((p) => p.id === status.paperId);
        if (prev && status.status !== prev.status) {
          if (status.status === "READY") toast.success("Sujet prêt !");
          if (status.status === "FAILED") toast.error(status.error ?? "Échec de la génération.");
          terminal = true;
        }
      }
      if (terminal) {
        await refresh();
      } else {
        setPapers((prevPapers) =>
          prevPapers.map((p) => {
            const upd = updates.find((u) => u?.paperId === p.id);
            return upd ? { ...p, totalSlots: upd.totalSlots, resolvedSlots: upd.resolvedSlots } : p;
          }),
        );
      }
    }, 1500);
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
          {isCreating ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Préparation…
            </span>
          ) : (
            "Préparer un nouveau sujet"
          )}
        </Button>
      </div>

      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Historique</h2>
        {papers.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">Aucun sujet généré pour l’instant.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {papers.map((p) => {
              const pending = p.status === "PENDING" || p.status === "GENERATING";
              return (
                <li key={p.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">
                        {p.subtests.map((s) => SUBTEST_LABELS[s]).join(" · ")}
                      </span>
                      <span className="ml-2 text-foreground/45">
                        {new Date(p.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="flex items-center gap-1.5">
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                      {p.status === "READY" && (
                        <Link
                          href={`/objectif-b1/examens/${p.id}/${p.subtests[0]}`}
                          className="text-primary hover:underline"
                        >
                          Passer →
                        </Link>
                      )}
                    </div>
                  </div>
                  {pending && (
                    <GenerationProgress resolvedSlots={p.resolvedSlots} totalSlots={p.totalSlots} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
