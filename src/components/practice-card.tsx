"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  getPracticeCardAction,
  submitPracticeAction,
  refinePracticeVerdictAction,
  type PracticeCard as PracticeCardData,
  type PracticeResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";
import { LevelPips } from "@/components/level-pips";
import { useVerifyPile, VerifyPile } from "@/components/verify-pile";

export interface ThemeOption {
  key: string;
  label: string;
}

/** Vert = exact ; ambre = accepté avec réserve (faute de frappe ou « oui mais ») ; rouge = faux. */
function resultRingClass(result: PracticeResult | null): string {
  if (!result) return "";
  if (!result.correct) return "ring-2 ring-red-400/60";
  return result.tolerated || result.close
    ? "ring-2 ring-amber-400/60"
    : "ring-2 ring-emerald-400/60";
}

export function PracticeCard({
  themes,
  level,
}: {
  themes: ThemeOption[];
  /** Restrict the queue to words at this mastery level (from Collection). */
  level?: number;
}) {
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [question, setQuestion] = useState<PracticeCardData | "empty" | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [isChecking, startCheck] = useTransition();
  const answerRef = useRef<HTMLInputElement>(null);
  // Un avis IA en cours ne doit jamais bloquer le passage à la carte suivante : on le laisse se
  // résoudre en arrière-plan (pile visible en bas d'écran) et, si l'utilisateur est encore sur
  // la même carte quand la réponse arrive, on corrige l'affichage en place.
  const verify = useVerifyPile(refinePracticeVerdictAction);
  const questionGen = useRef(0);

  const load = useCallback(
    (exclude?: string) => {
      startLoad(async () => {
        const q = await getPracticeCardAction(exclude, theme, level);
        questionGen.current += 1;
        setQuestion(q);
        setAnswer("");
        setResult(null);
        setTimeout(() => answerRef.current?.focus(), 0);
      });
    },
    [theme, level],
  );

  useEffect(() => {
    load();
    // Changing the theme filter starts a fresh card, not the score.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, level]);

  function check() {
    if (!question || question === "empty" || result || !answer.trim()) return;
    const gen = questionGen.current;
    const askedAnswer = answer.trim();
    startCheck(async () => {
      const r = await submitPracticeAction({
        kind: question.kind,
        entryId: question.entryId,
        formKey: question.formKey,
        reviewKey: question.reviewKey,
        isNew: question.isNew,
        answer: askedAnswer,
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
      showXpToast(r.xp);
      if (r.pending && r.refineToken) {
        verify.enqueue(r.refineToken, displayAccent(question.accented), askedAnswer, (final) => {
          // On ne corrige l'affichage en place que si l'utilisateur regarde encore cette carte ;
          // sinon le résultat définitif reste visible seulement dans la pile, en passant.
          if (questionGen.current === gen) setResult(final);
          if (final.correct) setScore((s) => ({ right: s.right + 1, total: s.total }));
        });
      }
    });
  }

  if (question === "empty") {
    return (
      <div className="space-y-4">
        {themes.length > 1 && (
          <ThemeFilter themes={themes} value={theme} onChange={setTheme} />
        )}
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
        <VerifyPile pile={verify.pile} />
      </div>
    );
  }

  if (!question) {
    return (
      <>
        <p className="text-center text-sm text-foreground/50">Chargement…</p>
        <VerifyPile pile={verify.pile} />
      </>
    );
  }

  const isTranslateFr = question.kind === "translate-ru-fr";
  const promptLabel =
    question.kind === "recall"
      ? `Donne la forme : ${question.formLabel}`
      : isTranslateFr
        ? "Traduis en français"
        : `Traduis en russe — ${question.formLabel}`;
  const promptText = isTranslateFr
    ? displayAccent(question.promptRu)
    : question.kind === "translate-fr-ru"
      ? question.translationsFr
      : displayAccent(question.accented);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        {themes.length > 1 ? (
          <ThemeFilter themes={themes} value={theme} onChange={setTheme} />
        ) : (
          <span />
        )}
        <span className="shrink-0 text-sm text-foreground/55">
          {score.right}/{score.total}
        </span>
      </div>

      <div className="glass-strong rounded-3xl p-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="secondary" className="bg-white/10">
            {question.typeLabel}
          </Badge>
          {question.kind !== "recall" && (
            <Badge variant="secondary" className="bg-primary/20 text-primary">
              Traduction
            </Badge>
          )}
          {question.isNew && (
            <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-300">
              Nouveau
            </Badge>
          )}
        </div>

        <div
          className={`mt-4 ${
            question.kind === "translate-fr-ru" ? "text-3xl font-medium" : "font-display text-5xl"
          }`}
        >
          {promptText}
        </div>
        {question.kind === "recall" && question.translationsFr && (
          <div className="mt-1 text-sm text-foreground/55">{question.translationsFr}</div>
        )}
        {question.kind === "translate-ru-fr" && (
          <div className="mt-1 text-sm text-foreground/55">{question.formLabel}</div>
        )}
        <div className="mt-6 text-foreground/70">{promptLabel}</div>

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
            if (result) load(`${question.entryId}|${question.reviewKey}`);
            else check();
          }}
          className="mx-auto mt-5 max-w-sm"
        >
          {isTranslateFr ? (
            <Input
              ref={answerRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="réponse en français…"
              autoFocus
              autoComplete="off"
              readOnly={!!result}
              className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${resultRingClass(result)}`}
            />
          ) : (
            <RussianInput
              inputRef={answerRef}
              value={answer}
              onValueChange={setAnswer}
              placeholder="ta réponse…"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              readOnly={!!result}
              className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${resultRingClass(result)}`}
            />
          )}

          {result && (
            <div className="mt-4 text-sm">
              {result.correct ? (
                <>
                  <p
                    className={
                      result.tolerated || result.close ? "text-amber-300" : "text-emerald-300"
                    }
                  >
                    {result.close
                      ? "Oui mais… c’est l’idée, pas le bon mot 🤏"
                      : result.discovered
                        ? "Nouveau mot découvert ! 🎉"
                        : result.tolerated
                          ? "Accepté (petite imprécision) 👍"
                          : "Correct !"}
                  </p>
                  {result.close && result.note && (
                    <p className="mt-1 text-xs text-amber-200/70">{result.note}</p>
                  )}
                  {(result.tolerated || result.close) && (
                    <p className="mt-1 text-xs text-foreground/45">
                      Forme exacte :{" "}
                      <span className="font-medium">
                        {result.expected
                          .map((v) => (isTranslateFr ? v : displayAccent(v)))
                          .join(" / ")}
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-red-300">
                    Réponse attendue :{" "}
                    <span className="font-semibold">
                      {result.expected
                        .map((v) => (isTranslateFr ? v : displayAccent(v)))
                        .join(" / ")}
                    </span>
                  </p>
                  {result.note && (
                    <p className="mt-1 text-xs text-foreground/50">{result.note}</p>
                  )}
                </>
              )}
              <LevelPips result={result} />
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
      <VerifyPile pile={verify.pile} />
    </div>
  );
}

function ThemeFilter({
  themes,
  value,
  onChange,
}: {
  themes: ThemeOption[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
          value === undefined
            ? "bg-primary/40 text-foreground"
            : "bg-white/5 text-foreground/60 hover:text-foreground"
        }`}
      >
        Tous
      </button>
      {themes.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            value === t.key
              ? "bg-primary/40 text-foreground"
              : "bg-white/5 text-foreground/60 hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
