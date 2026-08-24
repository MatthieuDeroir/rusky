"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  finishAttemptAction,
  submitTrkiAnswerAction,
  type PassationData,
} from "@/app/objectif-b1/actions";
import { Button } from "@/components/ui/button";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LETTERS = ["A", "B", "C", "D"];

export function ExamPassation({ data, paperId }: { data: PassationData; paperId: number }) {
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
              {item.options.map((opt, idx) => (
                <li key={idx}>
                  {LETTERS[idx]}. {opt}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Matrice de réponses</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Reporte ta réponse ici pour chaque item, comme à l’examen réel — pas de clic direct sur
          l’énoncé.
        </p>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                {LETTERS.map((l) => (
                  <TableHead key={l} className="text-center">
                    {l}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item, i) => (
                <TableRow key={item.id}>
                  <TableCell>{i + 1}</TableCell>
                  {LETTERS.map((l, idx) => (
                    <TableCell key={l} className="text-center">
                      <button
                        type="button"
                        onClick={() => choose(item.id, idx)}
                        className={`h-8 w-8 rounded-full border text-sm transition-colors ${
                          answers[item.id] === idx
                            ? "border-primary bg-primary/40 text-foreground"
                            : "border-white/15 text-foreground/50 hover:border-white/30"
                        }`}
                      >
                        {l}
                      </button>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Button size="lg" disabled={finishing} onClick={finish}>
        {finishing ? "Correction…" : "Terminer"}
      </Button>
    </div>
  );
}
