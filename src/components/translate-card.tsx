"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  getReviewTranslateQuestionAction,
  getTranslateQuestionAction,
  submitTranslateAction,
  type TranslateDirection,
  type TranslateQuestion,
  type TranslateResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";

export function TranslateCard({
  theme,
  review = false,
  direction: initialDirection = "ru-fr",
}: {
  theme?: string;
  review?: boolean;
  direction?: TranslateDirection;
}) {
  const [direction, setDirection] = useState<TranslateDirection>(initialDirection);
  const [question, setQuestion] = useState<TranslateQuestion | null | "empty">(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [isChecking, startCheck] = useTransition();
  const answerRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (dir: TranslateDirection, exclude?: string) => {
      startLoad(async () => {
        const q = review
          ? await getReviewTranslateQuestionAction(dir, exclude)
          : await getTranslateQuestionAction(dir, "all", exclude, theme);
        setQuestion(q ?? "empty");
        setAnswer("");
        setResult(null);
        setGaveUp(false);
        // Keep focus on the field so Enter targets the form, never a stray button.
        setTimeout(() => answerRef.current?.focus(), 0);
      });
    },
    [theme, review],
  );

  useEffect(() => {
    load(direction);
  }, [direction, load]);

  function switchDirection(dir: TranslateDirection) {
    if (dir === direction) return;
    setScore({ right: 0, total: 0 });
    setDirection(dir);
  }

  function check() {
    if (!question || question === "empty" || result || !answer.trim()) return;
    startCheck(async () => {
      const r = await submitTranslateAction({
        entryId: question.entryId,
        formKey: question.formKey,
        direction,
        answer: answer.trim(),
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
    });
  }

  function dontKnow() {
    if (!question || question === "empty" || result) return;
    startCheck(async () => {
      const r = await submitTranslateAction({
        entryId: question.entryId,
        formKey: question.formKey,
        direction,
        answer: "",
      });
      setResult(r);
      setGaveUp(true);
      setScore((s) => ({ right: s.right, total: s.total + 1 }));
    });
  }

  const toRussian = direction === "fr-ru";

  const directionToggle = (
    <div className="mx-auto flex w-fit gap-1 rounded-xl bg-white/5 p-1">
      {(
        [
          ["ru-fr", "Russe → Français"],
          ["fr-ru", "Français → Russe"],
        ] as [TranslateDirection, string][]
      ).map(([dir, label]) => (
        <button
          key={dir}
          type="button"
          onClick={() => switchDirection(dir)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            direction === dir ? "bg-primary/40 text-foreground" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (question === "empty") {
    return (
      <div className="space-y-4">
        {!review && directionToggle}
        <div className="glass-strong mt-2 rounded-3xl p-10 text-center">
          <h2 className="text-xl font-semibold">
            {review ? "Rien à rattraper 🎉" : "Rien à traduire pour l’instant"}
          </h2>
          <p className="mt-2 text-foreground/65">
            {review
              ? "Toutes les traductions ratées ont été revues. Reviens après d’autres exercices."
              : "Ajoute des mots à ta collection (avec une traduction française) pour t’entraîner."}
          </p>
          <Button render={<Link href="/add" />} nativeButton={false} className="mt-6">
            Ajouter un mot
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!review && directionToggle}

      {!question ? (
        <p className="text-center text-sm text-foreground/50">Chargement…</p>
      ) : (
        <>
          <div className="flex justify-end text-sm text-foreground/55">
            Score : {score.right}/{score.total}
          </div>

          <div className="glass-strong rounded-3xl p-8 text-center">
            <Badge variant="secondary" className="bg-white/10">
              {question.typeLabel}
            </Badge>

            <div
              className={`mt-4 ${toRussian ? "text-3xl font-medium" : "font-display text-5xl"}`}
            >
              {toRussian ? question.translationsFr : displayAccent(question.promptRu)}
            </div>
            {!toRussian && (
              <div className="mt-1 text-sm text-foreground/55">{question.formLabel}</div>
            )}
            <div className="mt-6 text-foreground/70">
              {toRussian ? (
                <>
                  Traduis en russe — <span className="font-medium">{question.formLabel}</span>
                </>
              ) : (
                "Traduis en français"
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (result)
                  load(direction, `${question.entryId}|${question.formKey ?? ""}`);
                else check();
              }}
              className="mx-auto mt-5 max-w-sm"
            >
              {toRussian ? (
                <RussianInput
                  inputRef={answerRef}
                  value={answer}
                  onValueChange={setAnswer}
                  placeholder="réponse en russe…"
                  autoFocus
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
              ) : (
                <Input
                  ref={answerRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="réponse en français…"
                  autoFocus
                  autoComplete="off"
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
              )}

              {result && (
                <div className="mt-4 text-sm">
                  {result.correct ? (
                    <p className="text-emerald-300">Correct ! 🎉</p>
                  ) : (
                    <p className={gaveUp ? "text-amber-300" : "text-red-300"}>
                      {gaveUp ? "La réponse : " : "Réponse attendue : "}
                      <span className="font-semibold">
                        {result.expected
                          .map((v) => (toRussian ? displayAccent(v) : v))
                          .join(" / ")}
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
        </>
      )}
    </div>
  );
}
