"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  getQuizQuestionAction,
  getReviewQuizQuestionAction,
  submitQuizAction,
  type QuizMode,
  type QuizQuestion,
  type QuizResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";

export function QuizCard({
  mode,
  theme,
  review = false,
}: {
  mode: QuizMode;
  theme?: string;
  review?: boolean;
}) {
  const [question, setQuestion] = useState<QuizQuestion | null | "empty">(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [isChecking, startCheck] = useTransition();
  const answerRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (exclude?: string) => {
      startLoad(async () => {
        const q = review
          ? await getReviewQuizQuestionAction(exclude)
          : await getQuizQuestionAction(mode, exclude, theme);
        setQuestion(q ?? "empty");
        setAnswer("");
        setResult(null);
        setGaveUp(false);
        // Keep focus on the field so Enter targets the form, never a stray button.
        setTimeout(() => answerRef.current?.focus(), 0);
      });
    },
    [mode, theme, review],
  );

  useEffect(() => {
    load();
  }, [load]);

  function check() {
    if (!question || question === "empty" || result || !answer.trim()) return;
    startCheck(async () => {
      const r = await submitQuizAction({
        entryId: question.entryId,
        formKey: question.formKey,
        answer: answer.trim(),
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
      showXpToast(r.xp);
    });
  }

  function dontKnow() {
    if (!question || question === "empty" || result) return;
    startCheck(async () => {
      const r = await submitQuizAction({
        entryId: question.entryId,
        formKey: question.formKey,
        answer: "",
      });
      setResult(r);
      setGaveUp(true);
      setScore((s) => ({ right: s.right, total: s.total + 1 }));
    });
  }

  if (question === "empty") {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">
          {review
            ? "Rien à rattraper 🎉"
            : mode === "discovered"
              ? "Rien à réviser pour l’instant"
              : "Rien à compléter pour l’instant"}
        </h2>
        <p className="mt-2 text-foreground/65">
          {review
            ? "Toutes les formes ratées ont été revues. Reviens après d’autres exercices."
            : mode === "discovered"
              ? "Ajoute des mots (ou découvre des formes) pour pouvoir les réviser."
              : "Toutes les formes de tes mots sont déjà découvertes — bravo !"}
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
          {question.typeLabel}
        </Badge>
        <div className="mt-4 font-display text-5xl">
          {displayAccent(question.accented)}
        </div>
        {question.translationsFr && (
          <div className="mt-1 text-sm text-foreground/55">{question.translationsFr}</div>
        )}
        <div className="mt-6 text-foreground/70">
          Donne la forme : <span className="font-medium">{question.formLabel}</span>
        </div>

        {question.hint.length > 0 && (
          <details className="group mx-auto mt-4 max-w-sm rounded-xl bg-white/5 px-4 py-2 text-left">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-foreground/60 hover:text-foreground">
              <span>Indice (règle)</span>
              <span className="text-foreground/40 transition-transform group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-foreground/80">
              {question.hint.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{displayAccent(line)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

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
              result
                ? result.correct
                  ? "ring-2 ring-emerald-400/60"
                  : gaveUp
                    ? "ring-2 ring-amber-400/60"
                    : "ring-2 ring-red-400/60"
                : ""
            }`}
          />

          {result && (
            <div className="mt-4 text-sm">
              {result.correct ? (
                <p className="text-emerald-300">Correct ! 🎉</p>
              ) : (
                <p className={gaveUp ? "text-amber-300" : "text-red-300"}>
                  {gaveUp ? "La réponse : " : "Réponse attendue : "}
                  <span className="font-semibold">
                    {result.expected.map((v) => displayAccent(v)).join(" / ")}
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-center gap-3">
            {!result ? (
              <>
                <Button type="submit" size="lg" disabled={isChecking || !answer.trim()}>
                  {isChecking ? "Vérification…" : "Vérifier"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="bg-white/10"
                  disabled={isChecking}
                  onClick={dontKnow}
                >
                  Je ne sais pas
                </Button>
              </>
            ) : (
              <Button type="submit" size="lg" disabled={isLoading}>
                {isLoading ? "…" : "Suivant"}
              </Button>
            )}
          </div>
        </form>
      </div>

      <p className="text-center text-xs text-foreground/40">
        L’accent n’est pas exigé ; les variantes correctes sont acceptées.
      </p>
    </div>
  );
}
