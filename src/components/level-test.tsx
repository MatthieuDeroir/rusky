"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  getLevelTestAction,
  submitQuizAction,
  submitLevelTestAction,
  type LevelTestInfo,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { milestonesFor, neededCorrect, TRACK_LABEL, type Track } from "@/lib/levels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";

type Outcome = { passed: boolean; validatedLevel: number } | null;

export function LevelTest({ track }: { track: Track }) {
  const milestones = milestonesFor(track);
  const [info, setInfo] = useState<LevelTestInfo | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitQuizAction>> | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [right, setRight] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isLoading, startLoad] = useTransition();
  const [isChecking, startCheck] = useTransition();
  const [isFinishing, startFinish] = useTransition();
  const answerRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    startLoad(async () => {
      const i = await getLevelTestAction(track);
      setInfo(i);
      setIdx(0);
      setAnswer("");
      setResult(null);
      setGaveUp(false);
      setRight(0);
      setOutcome(null);
    });
  }, [track]);

  useEffect(() => {
    load();
  }, [load]);

  const question = info && !info.insufficient ? info.questions[idx] : null;

  function check(giveUp = false) {
    if (!question || result || (!giveUp && !answer.trim())) return;
    startCheck(async () => {
      const r = await submitQuizAction({
        entryId: question.entryId,
        formKey: question.formKey,
        answer: giveUp ? "" : answer.trim(),
      });
      setResult(r);
      setGaveUp(giveUp);
      if (r.correct) setRight((n) => n + 1);
    });
  }

  function next() {
    if (!info) return;
    const isLast = idx >= info.questions.length - 1;
    if (!isLast) {
      setIdx((i) => i + 1);
      setAnswer("");
      setResult(null);
      setGaveUp(false);
      setTimeout(() => answerRef.current?.focus(), 0);
      return;
    }
    // Last question answered → finalize the control.
    startFinish(async () => {
      const o = await submitLevelTestAction({
        track,
        level: info.targetLevel,
        score: right,
        total: info.questions.length,
      });
      setOutcome(o);
    });
  }

  if (!info) return <p className="text-center text-sm text-foreground/50">Chargement…</p>;

  const targetLabel = milestones[info.targetLevel]?.label ?? "—";

  // Not enough filled forms in this family yet to run a full control.
  if (info.insufficient) {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">Pas encore assez de formes</h2>
        <p className="mt-2 text-foreground/65">
          Le contrôle « {targetLabel} » ({TRACK_LABEL[track]}) demande {info.size} formes
          tirées de celles que tu as déjà remplies. Tu en as {info.available}. Complète encore
          quelques tableaux, puis reviens valider ce palier.
        </p>
        <Button render={<Link href="/" />} nativeButton={false} className="mt-6">
          Retour
        </Button>
      </div>
    );
  }

  // Result screen.
  if (outcome) {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        {outcome.passed ? (
          <>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/50">
              <Check className="size-8 text-emerald-300" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold">Palier validé !</h2>
            <p className="mt-2 text-foreground/70">
              Tu as obtenu le titre <span className="font-semibold">{targetLabel}</span> en{" "}
              {TRACK_LABEL[track].toLowerCase()} ({right}/{info.questions.length}).
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">Pas tout à fait</h2>
            <p className="mt-2 text-foreground/70">
              {right}/{info.questions.length} — il fallait{" "}
              {neededCorrect(info.questions.length)} bonnes réponses pour valider «{" "}
              {targetLabel} ». Retente quand tu veux.
            </p>
          </>
        )}
        <div className="mt-6 flex justify-center gap-3">
          {!outcome.passed && (
            <Button size="lg" onClick={load} disabled={isLoading}>
              Recommencer
            </Button>
          )}
          <Button
            render={<Link href="/" />}
            nativeButton={false}
            variant={outcome.passed ? "default" : "secondary"}
            size="lg"
            className={outcome.passed ? "" : "bg-white/10"}
          >
            Retour au tableau de bord
          </Button>
        </div>
      </div>
    );
  }

  if (!question) return <p className="text-center text-sm text-foreground/50">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-foreground/55">
        <span>
          Contrôle · {TRACK_LABEL[track]} · <span className="text-foreground/80">{targetLabel}</span>
        </span>
        <span>
          {idx + 1}/{info.questions.length} · {right} ✓
        </span>
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

        {question.hint.length > 0 && (
          <details className="group mx-auto mt-4 max-w-sm rounded-xl bg-white/5 px-4 py-2 text-left">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-foreground/60 hover:text-foreground">
              <span>Indice (règle)</span>
              <span className="text-foreground/40 transition-transform group-open:rotate-180">⌄</span>
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
            if (result) next();
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
                  onClick={() => check(true)}
                >
                  Je ne sais pas
                </Button>
              </>
            ) : (
              <Button type="submit" size="lg" disabled={isFinishing}>
                {idx >= info.questions.length - 1
                  ? isFinishing
                    ? "…"
                    : "Terminer le contrôle"
                  : "Suivant"}
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
