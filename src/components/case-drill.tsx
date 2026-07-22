"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  getCaseQuestionAction,
  submitCaseAction,
  type CaseQuestion,
  type CaseResult,
} from "@/app/actions";
import { displayAccent, type CaseCode } from "@/lib/grammar";
import { CASE_FR, CASE_ORDER } from "@/lib/cases";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function CaseDrill({
  caseFilter = null,
  review = false,
}: {
  caseFilter?: CaseCode | null;
  review?: boolean;
}) {
  const [question, setQuestion] = useState<CaseQuestion | null | "empty">(null);
  const [result, setResult] = useState<CaseResult | null>(null);
  const [chosen, setChosen] = useState<CaseCode | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [, startCheck] = useTransition();

  const load = useCallback(
    (exclude?: string) => {
      startLoad(async () => {
        const q = await getCaseQuestionAction(caseFilter, exclude, review);
        setQuestion(q ?? "empty");
        setResult(null);
        setChosen(null);
      });
    },
    [caseFilter, review],
  );

  useEffect(() => {
    load();
  }, [load]);

  function choose(c: CaseCode) {
    if (!question || question === "empty" || result) return;
    setChosen(c);
    startCheck(async () => {
      const r = await submitCaseAction({
        entryId: question.entryId,
        trigger: question.trigger,
        chosen: c,
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
    });
  }

  if (question === "empty") {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">
          {review ? "Rien à rattraper 🎉" : "Rien à travailler ici"}
        </h2>
        <p className="mt-2 text-foreground/65">
          {review
            ? "Toutes les règles de cas ratées ont été revues."
            : "Aucun déclencheur disponible pour ce cas."}
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
        Score : {score.right}/{score.total}
      </div>

      <div className="glass-strong rounded-3xl p-8 text-center">
        <Badge variant="secondary" className="bg-white/10">
          {question.triggerKind}
        </Badge>

        <div className="mt-5 font-display text-4xl">
          {displayAccent(question.trigger)}{" "}
          <span className="text-foreground/40">
            {question.word ? displayAccent(question.word) : "…"}
          </span>
        </div>
        <div className="mt-6 text-foreground/70">
          Quel cas faut-il employer{question.word ? ` pour « ${displayAccent(question.word)} »` : ""} ?
        </div>

        <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-3">
          {CASE_ORDER.map((c) => {
            const isCorrect = question.correctCases.includes(c);
            const isChosen = c === chosen;
            const state = !result
              ? "idle"
              : isCorrect
                ? "correct"
                : isChosen
                  ? "wrong"
                  : "dim";
            return (
              <button
                key={c}
                type="button"
                disabled={!!result}
                onClick={() => choose(c)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium capitalize ring-1 transition-colors ${
                  state === "idle"
                    ? "bg-white/5 ring-white/10 hover:bg-primary/30"
                    : state === "correct"
                      ? "bg-emerald-400/20 text-emerald-100 ring-emerald-400/50"
                      : state === "wrong"
                        ? "bg-red-400/20 text-red-100 ring-red-400/50"
                        : "bg-white/5 text-foreground/40 ring-transparent"
                }`}
              >
                {CASE_FR[c]}
              </button>
            );
          })}
        </div>

        {result && (
          <div className="mt-5 space-y-1 text-sm">
            <p className={result.correct ? "text-emerald-300" : "text-red-300"}>
              {result.correct
                ? "Correct ! 🎉"
                : `C’est ${question.correctCases.map((c) => CASE_FR[c]).join(" ou ")}.`}
            </p>
            <p className="text-foreground/60">{result.explanation}</p>
            {question.examples.length > 0 && (
              <p className="text-foreground/70">
                Ex. :{" "}
                {question.examples.map((ex, i) => (
                  <span key={ex.cas}>
                    {i > 0 && " · "}
                    <span className="font-medium">
                      {displayAccent(question.trigger)} {displayAccent(ex.form)}
                    </span>{" "}
                    <span className="text-foreground/45">({CASE_FR[ex.cas]})</span>
                  </span>
                ))}
              </p>
            )}
            <div className="pt-3">
              <Button type="button" onClick={() => load(question.key)} disabled={isLoading}>
                {isLoading ? "…" : "Suivant"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
