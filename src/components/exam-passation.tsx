"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  finishAttemptAction,
  submitTrkiAnswerAction,
  type PassationData,
} from "@/app/objectif-b1/actions";
import { SpeakingPassation } from "@/components/speaking-passation";
import { Button } from "@/components/ui/button";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

const LETTERS = ["A", "B", "C", "D"];

/** Point d'entrée unique de la passation — délègue selon le sous-test : QCM (lexgram/reading/
 * listening) ici même, production libre (speaking/writing) à un composant dédié (chronométrage
 * prépa/réponse, pas de matrice de réponses). */
export function ExamPassation({ data, paperId }: { data: PassationData; paperId: number }) {
  if (data.subtest === "speaking") return <SpeakingPassation data={data} paperId={paperId} />;
  return <QcmPassation data={data} paperId={paperId} />;
}

function QcmPassation({ data, paperId }: { data: PassationData; paperId: number }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const totalSeconds = data.durationMin * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    await finishAttemptAction(data.attemptId);
    router.push(`/objectif-b1/examens/${paperId}/resultats?attemptId=${data.attemptId}`);
  }, [data.attemptId, finishing, paperId, router]);

  // Fin de temps : soumet et redirige sans passer par finish() (qui déclenche un setState
  // synchrone en tête d'effet, à éviter — voir react-hooks/set-state-in-effect).
  useEffect(() => {
    if (remaining !== 0) return;
    finishAttemptAction(data.attemptId).then(() => {
      router.push(`/objectif-b1/examens/${paperId}/resultats?attemptId=${data.attemptId}`);
    });
  }, [remaining, data.attemptId, paperId, router]);

  function choose(itemId: number, index: number) {
    setAnswers((prev) => ({ ...prev, [itemId]: index }));
    submitTrkiAnswerAction(data.attemptId, itemId, index).catch(() =>
      toast.error("La réponse n'a pas pu être enregistrée."),
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-6">
      <div className="glass-strong sticky top-4 z-10 rounded-2xl p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {answeredCount}/{data.items.length} répondues
          </span>
          <span className={remaining < 60 ? "font-semibold text-red-400" : ""}>
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>
        <Progress value={(remaining / totalSeconds) * 100} className="mt-2">
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      </div>

      <div className="space-y-4">
        {data.items.map((item, i) => (
          <div key={item.id} className="glass rounded-2xl p-5">
            <p className="text-sm text-foreground/50">Item {i + 1}</p>
            <p className="mt-1 text-lg">{item.stem}</p>
            <ul className="mt-3 space-y-1 text-sm text-foreground/70">
              {(item.options ?? []).map((opt, idx) => (
                <li key={idx}>
                  {LETTERS[idx]}. {opt}
                </li>
              ))}
            </ul>
            {/* Report la réponse dans une rangée séparée, pas un clic direct sur l'énoncé —
                comme la vraie matrice papier — mais juste sous l'item pour ne pas avoir à
                scroller jusqu'en bas de la page à chaque réponse. */}
            <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
              <span className="mr-1 text-xs uppercase tracking-wide text-foreground/40">
                Réponse
              </span>
              {LETTERS.map((l, idx) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => choose(item.id, idx)}
                  className={`h-9 w-9 rounded-full border text-sm font-medium transition-colors ${
                    answers[item.id] === idx
                      ? "border-primary bg-primary/40 text-foreground"
                      : "border-white/15 text-foreground/50 hover:border-white/30"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button size="lg" disabled={finishing} onClick={finish}>
        {finishing ? "Correction…" : "Terminer"}
      </Button>
    </div>
  );
}
