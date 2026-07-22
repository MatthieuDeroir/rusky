"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  getReviewCardAction,
  submitReviewAction,
  type QuizQuestion,
  type ReviewResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";

function dueLabel(days: number): string {
  if (days <= 0) return "à revoir bientôt";
  if (days === 1) return "revient demain";
  return `revient dans ${days} j`;
}

export function ReviserCard() {
  const [question, setQuestion] = useState<QuizQuestion | "empty" | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [isChecking, startCheck] = useTransition();
  const answerRef = useRef<HTMLInputElement>(null);

  const load = useCallback((exclude?: string) => {
    startLoad(async () => {
      const q = await getReviewCardAction(exclude);
      setQuestion(q);
      setAnswer("");
      setResult(null);
      setTimeout(() => answerRef.current?.focus(), 0);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function check() {
    if (!question || question === "empty" || result || !answer.trim()) return;
    startCheck(async () => {
      const r = await submitReviewAction({
        entryId: question.entryId,
        formKey: question.formKey,
        answer: answer.trim(),
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
      showXpToast(r.xp);
    });
  }

  if (question === "empty") {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">Rien à réviser 🎉</h2>
        <p className="mt-2 text-foreground/65">
          Tu es à jour ! Les formes reviendront à réviser au fil des jours. Découvre de
          nouveaux mots en attendant.
        </p>
        <Button render={<Link href="/add" />} nativeButton={false} className="mt-6">
          Ajouter un mot
        </Button>
      </div>
    );
  }

  if (!question) {
    return <p className="text-center text-sm text-foreground/50">Chargement…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end text-sm text-foreground/55">
        Révisées : {score.right}/{score.total}
      </div>

      <div className="glass-strong rounded-3xl p-8 text-center">
        <Badge variant="secondary" className="bg-white/10">
          {question.typeLabel}
        </Badge>
        <div className="mt-4 font-display text-5xl">{displayAccent(question.accented)}</div>
        {question.translationsFr && (
          <div className="mt-1 text-sm text-foreground/55">{question.translationsFr}</div>
        )}
        <div className="mt-6 text-foreground/70">
          Donne la forme : <span className="font-medium">{question.formLabel}</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (result) load(`${question.entryId}|${question.formKey}`);
            else check();
          }}
          className="mx-auto mt-5 max-w-sm"
        >
          <RussianInput
            inputRef={answerRef}
            value={answer}
            onValueChange={setAnswer}
            placeholder="ta réponse…"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            readOnly={!!result}
            className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${
              result ? (result.correct ? "ring-2 ring-emerald-400/60" : "ring-2 ring-red-400/60") : ""
            }`}
          />

          {result && (
            <div className="mt-4 text-sm">
              {result.correct ? (
                <p className="text-emerald-300">Correct ! · {dueLabel(result.dueInDays)}</p>
              ) : (
                <p className="text-red-300">
                  Réponse attendue :{" "}
                  <span className="font-semibold">
                    {result.expected.map((v) => displayAccent(v)).join(" / ")}
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-center gap-3">
            {!result ? (
              <Button type="submit" size="lg" disabled={isChecking || !answer.trim()}>
                {isChecking ? "Vérification…" : "Vérifier"}
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={isLoading}>
                {isLoading ? "…" : "Suivant"}
              </Button>
            )}
          </div>
        </form>
      </div>

      <p className="text-center text-xs text-foreground/40">
        Révisions espacées : les formes réussies reviennent de moins en moins souvent.
      </p>
    </div>
  );
}
