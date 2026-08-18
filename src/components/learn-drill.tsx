"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  getLearnCardAction,
  revealFailureDrillAction,
  submitPracticeAction,
  type FailureDrillCard,
  type FailureDrillReveal,
  type PracticeResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import type { DrillMode } from "@/lib/learn";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";

type Phase = "guess" | "reveal" | "retry";

/** Consecutive correct answers before an item is considered drilled in, in rote mode. */
const ROTE_STREAK_TARGET = 3;

export function LearnDrill({ scopeKey, mode }: { scopeKey: string; mode: DrillMode }) {
  const [card, setCard] = useState<FailureDrillCard | "empty" | null>(null);
  const [phase, setPhase] = useState<Phase>("guess");
  const [guess, setGuess] = useState("");
  const [reveal, setReveal] = useState<FailureDrillReveal | null>(null);
  const [retryAnswer, setRetryAnswer] = useState("");
  const [retryResult, setRetryResult] = useState<PracticeResult | null>(null);
  const [rounds, setRounds] = useState({ attempted: 0, retained: 0 });
  // Rote mode: consecutive correct answers per (entry|form), so an item only leaves the
  // rotation once it's been right several times in a row.
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [isLoading, startLoad] = useTransition();
  const [isBusy, startBusy] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const isRote = mode === "rote";

  const load = useCallback(
    (exclude?: string) => {
      startLoad(async () => {
        const c = await getLearnCardAction(scopeKey, exclude);
        setCard(c);
        // A cell the user already knows has no rule left to discover — go straight to answering.
        setPhase(isRote || (c !== "empty" && c !== null && c.alreadyKnown) ? "retry" : "guess");
        setGuess("");
        setReveal(null);
        setRetryAnswer("");
        setRetryResult(null);
        setTimeout(() => inputRef.current?.focus(), 0);
      });
    },
    [scopeKey, isRote],
  );

  useEffect(() => {
    load();
  }, [load]);

  function submitGuess() {
    if (!card || card === "empty") return;
    startBusy(async () => {
      const r = await revealFailureDrillAction({
        entryId: card.entryId,
        formKey: card.formKey,
        guess: guess.trim(),
      });
      setReveal(r);
      setPhase("reveal");
    });
  }

  function submitAnswer() {
    if (!card || card === "empty" || !retryAnswer.trim()) return;
    startBusy(async () => {
      const r = await submitPracticeAction({
        kind: "recall",
        entryId: card.entryId,
        formKey: card.formKey,
        reviewKey: card.formKey,
        isNew: !card.alreadyKnown,
        answer: retryAnswer.trim(),
      });
      setRetryResult(r);
      setRounds((s) => ({
        attempted: s.attempted + 1,
        retained: s.retained + (r.correct ? 1 : 0),
      }));
      if (isRote) {
        const id = `${card.entryId}|${card.formKey}`;
        setStreaks((s) => ({ ...s, [id]: r.correct ? (s[id] ?? 0) + 1 : 0 }));
      }
      showXpToast(r.xp);
    });
  }

  function next() {
    if (!card || card === "empty") return;
    const id = `${card.entryId}|${card.formKey}`;
    // Rote: keep hammering the same item until it's been right ROTE_STREAK_TARGET times running.
    const keepDrilling = isRote && (streaks[id] ?? 0) < ROTE_STREAK_TARGET;
    if (keepDrilling) {
      setRetryAnswer("");
      setRetryResult(null);
      setPhase("retry");
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    load(id);
  }

  if (card === "empty") {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">Rien à travailler ici</h2>
        <p className="mt-2 text-foreground/65">
          Ta collection ne contient pas encore de mot de cette catégorie. Ajoute des mots pour
          débloquer cet exercice.
        </p>
        <Button render={<Link href="/add" />} nativeButton={false} className="mt-6">
          Ajouter un mot
        </Button>
      </div>
    );
  }

  if (!card) {
    return <p className="text-center text-sm text-foreground/50">Chargement…</p>;
  }

  const cardId = `${card.entryId}|${card.formKey}`;
  const streak = streaks[cardId] ?? 0;

  return (
    <div className="space-y-5">
      {rounds.attempted > 0 && (
        <div className="flex justify-end text-sm text-foreground/55">
          {rounds.retained}/{rounds.attempted} réussies
        </div>
      )}

      <div className="glass-strong rounded-3xl p-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary" className="bg-white/10">
            {card.typeLabel}
          </Badge>
          <Badge variant="secondary" className="bg-primary/20 text-primary">
            {isRote
              ? "Par cœur"
              : phase === "guess"
                ? "Devine"
                : phase === "reveal"
                  ? "Règle"
                  : "Retente"}
          </Badge>
          {isRote && (
            <Badge variant="secondary" className="bg-white/10">
              {streak}/{ROTE_STREAK_TARGET} d’affilée
            </Badge>
          )}
        </div>

        <div className="mt-4 font-display text-5xl">{displayAccent(card.accented)}</div>
        {card.translationsFr && (
          <div className="mt-1 text-sm text-foreground/55">{card.translationsFr}</div>
        )}
        <div className="mt-6 text-foreground/70">
          Forme demandée : <span className="font-medium">{card.formLabel}</span>
        </div>

        {phase === "guess" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitGuess();
            }}
            className="mx-auto mt-5 max-w-sm"
          >
            <p className="mb-3 text-xs text-foreground/45">
              Tu ne l’as pas encore apprise — tente ta chance, sans indice. On corrige juste
              après.
            </p>
            <RussianInput
              inputRef={inputRef}
              value={guess}
              onValueChange={setGuess}
              placeholder="ta tentative…"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-14 border-white/15 bg-white/5 text-center text-2xl"
            />
            <div className="mt-5 flex justify-center gap-3">
              <Button type="submit" size="lg" disabled={isBusy || !guess.trim()}>
                {isBusy ? "…" : "Je tente"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="bg-white/10"
                disabled={isBusy}
                onClick={() => {
                  setGuess("");
                  submitGuess();
                }}
              >
                Je ne sais pas
              </Button>
            </div>
          </form>
        )}

        {phase === "reveal" && reveal && (
          <div className="mx-auto mt-5 max-w-sm space-y-4 text-left">
            <p className="text-center text-sm">
              {guess.trim() ? (
                <>
                  Ta tentative :{" "}
                  <span className="font-semibold">{displayAccent(guess)}</span>
                </>
              ) : (
                "Tu es passé cette fois-ci."
              )}
              {reveal.guessWasCorrect && (
                <span className="ml-2 text-emerald-300">Bien vu !</span>
              )}
            </p>
            <p className="text-center text-sm">
              Réponse correcte :{" "}
              <span className="font-semibold text-primary">
                {reveal.expected.map((v) => displayAccent(v)).join(" / ")}
              </span>
            </p>
            {reveal.hint.length > 0 && (
              <div className="rounded-xl bg-white/5 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">
                  Pourquoi
                </p>
                <ul className="space-y-1 text-xs text-foreground/80">
                  {reveal.hint.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>{displayAccent(line)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-center pt-1">
              <Button
                size="lg"
                onClick={() => {
                  setPhase("retry");
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                Je retente
              </Button>
            </div>
          </div>
        )}

        {phase === "retry" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (retryResult) next();
              else submitAnswer();
            }}
            className="mx-auto mt-5 max-w-sm"
          >
            <RussianInput
              inputRef={inputRef}
              value={retryAnswer}
              onValueChange={setRetryAnswer}
              placeholder={isRote ? "de mémoire…" : "maintenant que tu sais…"}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              readOnly={!!retryResult}
              className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${
                retryResult
                  ? retryResult.correct
                    ? "ring-2 ring-emerald-400/60"
                    : "ring-2 ring-red-400/60"
                  : ""
              }`}
            />

            {retryResult && (
              <div className="mt-4 text-sm">
                {retryResult.correct ? (
                  <p className="text-emerald-300">
                    {isRote && streak < ROTE_STREAK_TARGET
                      ? `Encore ${ROTE_STREAK_TARGET - streak} fois d’affilée…`
                      : "Retenu ! 🎉"}
                  </p>
                ) : (
                  <p className="text-red-300">
                    {isRote ? "Non — on recommence : " : "Pas encore — la réponse : "}
                    <span className="font-semibold">
                      {retryResult.expected.map((v) => displayAccent(v)).join(" / ")}
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-center gap-3">
              {!retryResult ? (
                <Button type="submit" size="lg" disabled={isBusy || !retryAnswer.trim()}>
                  {isBusy ? "Vérification…" : "Vérifier"}
                </Button>
              ) : (
                <Button type="submit" size="lg" disabled={isLoading}>
                  {isLoading ? "…" : isRote && streak < ROTE_STREAK_TARGET ? "Encore" : "Suivant"}
                </Button>
              )}
            </div>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-foreground/40">
        {isRote
          ? `Aucune règle à déduire : la même forme revient jusqu’à ${ROTE_STREAK_TARGET} bonnes réponses d’affilée.`
          : "Deviner avant d’apprendre, puis retenter juste après la règle : l’erreur ancre la correction."}
      </p>
    </div>
  );
}
