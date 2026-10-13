"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RotateCw } from "lucide-react";
import { ensureTodayAction, type TodayState } from "@/app/seance/actions";
import { getTextStateAction, retryAnalysisAction } from "@/app/lire/actions";
import { ReviewSession } from "./review-session";
import { DecodeCard } from "./decode-card";
import { Button } from "@/components/ui/button";

/** Le quotidien (10-20 min) : révision éclair → texte du jour → phrase à décortiquer. Le texte et
 * la phrase sont générés en tâche de fond dès l'ouverture, pendant qu'on révise. */
export function TodayView({ decodeDone }: { decodeDone: boolean }) {
  const [today, setToday] = useState<TodayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    ensureTodayAction()
      .then(setToday)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);

  // Sonde l'état du texte du jour tant qu'il se prépare.
  const dailyId = today?.daily?.id;
  const dailyStatus = today?.daily?.status;
  useEffect(() => {
    if (!dailyId || dailyStatus === "READY" || dailyStatus === "FAILED") return;
    const id = setInterval(async () => {
      try {
        const st = await getTextStateAction(dailyId);
        setToday((t) => (t && t.daily ? { ...t, daily: { ...t.daily, title: st.title, status: st.status } } : t));
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [dailyId, dailyStatus]);

  return (
    <div className="space-y-5">
      <Step n={1} title="Révision éclair" hint="3 à 5 minutes">
        <ReviewSession limit={8} />
      </Step>

      <Step n={2} title="Texte du jour" hint="5 à 10 minutes">
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!today && !error && <p className="text-sm text-foreground/50">Préparation…</p>}
        {today?.daily && (
          <div className="space-y-2">
            {today.unitTitle && (
              <p className="text-xs text-foreground/45">Structure de la semaine : {today.unitTitle}</p>
            )}
            {today.daily.status === "FAILED" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await retryAnalysisAction(today.daily!.id);
                  setToday({ ...today, daily: { ...today.daily!, status: "GENERATING" } });
                }}
              >
                <RotateCw className="size-4" /> Réessayer la génération
              </Button>
            ) : (
              <Link
                href={`/lire/${today.daily.id}?from=/jour`}
                className="glass glass-lift flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-lg">{today.daily.title}</p>
                  <p className="text-xs text-foreground/50">
                    {today.daily.completed
                      ? "✓ Lu aujourd’hui"
                      : today.daily.status === "GENERATING"
                        ? "En cours d’écriture… tu peux déjà l’ouvrir"
                        : today.daily.status === "READY"
                          ? "Prêt"
                          : "Analyse en cours… tu peux commencer"}
                  </p>
                </div>
                {today.daily.completed ? (
                  <Check className="size-5 text-emerald-300" />
                ) : (
                  <ArrowRight className="size-5 text-foreground/40" />
                )}
              </Link>
            )}
          </div>
        )}
      </Step>

      <Step n={3} title="Phrase à décortiquer" hint="bonus, 2 à 5 minutes">
        {today?.decode ? (
          <DecodeCard
            textId={today.decode.id}
            initialStatus={today.decode.status}
            initialAnalysis={today.decode.analysis}
            initiallyDone={decodeDone}
          />
        ) : (
          <p className="text-sm text-foreground/50">Préparation…</p>
        )}
      </Step>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="glass-strong space-y-3 rounded-3xl p-5">
      <div className="flex items-baseline gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {n}
        </span>
        <h2 className="font-display text-xl">{title}</h2>
        <span className="text-xs text-foreground/40">{hint}</span>
      </div>
      {children}
    </section>
  );
}
