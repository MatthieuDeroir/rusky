"use client";

import { useState, useTransition } from "react";
import {
  introduceB1WordAction,
  type B1MasteryPoolData,
  type B1VocabWord,
} from "@/app/objectif-b1/actions";
import { submitVocabAction } from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface CardStage {
  kind: "card";
  /** "introduce" pose l'Encounter (mot jamais vu) ; "review" ne fait qu'avancer (mot déjà
   * rencontré, juste raté au dernier test — simple rappel avant de retester). */
  mode: "introduce" | "review";
  queue: B1VocabWord[];
  /** Mots déjà passés par cette étape carte, en attente du prochain tour de test. */
  carriedOver: B1VocabWord[];
}
interface TestStage {
  kind: "test";
  queue: B1VocabWord[];
  roundSize: number;
  misses: B1VocabWord[];
}
interface DoneStage {
  kind: "done";
}
type Stage = CardStage | TestStage | DoneStage;

function startStage(data: B1MasteryPoolData): Stage {
  if (data.toIntroduce.length > 0) {
    return { kind: "card", mode: "introduce", queue: data.toIntroduce, carriedOver: data.toTest };
  }
  if (data.toTest.length > 0) {
    return { kind: "test", queue: data.toTest, roundSize: data.toTest.length, misses: [] };
  }
  return { kind: "done" };
}

/** Boucle "carte puis test" (§L, retour utilisateur) : découverte (flashcard) pour les mots
 * jamais rencontrés, puis test de traduction ru→fr sur tout le lot. Les mots ratés repassent en
 * carte-rappel puis sont retestés, en boucle, jusqu'à ce qu'un tour entier n'ait aucune faute —
 * c'est ce test réussi (pas juste "avoir vu la carte") qui compte comme "maîtrisé" côté serveur
 * (getB1State, b1-curriculum.ts). Direction fixée à ru→fr : exactement ce que le serveur vérifie
 * pour décider qu'un mot est acquis. */
export function B1MasteryPool({
  data,
  label,
  onValidated,
}: {
  data: B1MasteryPoolData;
  label: string;
  onValidated?: () => void;
}) {
  const [stage, setStage] = useState<Stage>(() => startStage(data));
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; expected: string[] } | null>(null);
  const [isBusy, startBusy] = useTransition();

  const totalWords = data.toIntroduce.length + data.toTest.length;
  if (totalWords === 0) {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">Rien à faire ici pour l’instant</h2>
        <p className="mt-2 text-foreground/65">
          Reviens plus tard — {label.toLowerCase()} se remplira au fil du parcours.
        </p>
      </div>
    );
  }

  function advanceCard(current: B1VocabWord, s: CardStage) {
    const rest = s.queue.slice(1);
    if (rest.length > 0) {
      setStage({ ...s, queue: rest });
      return;
    }
    const roundWords = [...s.carriedOver, current];
    setStage({ kind: "test", queue: roundWords, roundSize: roundWords.length, misses: [] });
  }

  function handleIntroduce(s: CardStage) {
    const current = s.queue[0];
    if (!current || isBusy) return;
    startBusy(async () => {
      const { xp } = await introduceB1WordAction(current.entryId);
      showXpToast(xp);
      advanceCard(current, s);
    });
  }

  function handleReview(s: CardStage) {
    const current = s.queue[0];
    if (!current) return;
    advanceCard(current, s);
  }

  function submitAnswer(s: TestStage) {
    const current = s.queue[0];
    if (!current || isBusy) return;
    startBusy(async () => {
      const r = await submitVocabAction({
        entryId: current.entryId,
        direction: "ru-fr",
        answer: answer.trim(),
      });
      setResult({ correct: r.correct, expected: r.expected });
      showXpToast(r.xp);
      if (!r.correct) setStage({ ...s, misses: [...s.misses, current] });
    });
  }

  function dontKnow(s: TestStage) {
    const current = s.queue[0];
    if (!current || isBusy) return;
    setAnswer("");
    startBusy(async () => {
      const r = await submitVocabAction({ entryId: current.entryId, direction: "ru-fr", answer: "" });
      setResult({ correct: false, expected: r.expected });
      setStage({ ...s, misses: [...s.misses, current] });
    });
  }

  function nextAfterResult(s: TestStage) {
    setAnswer("");
    setResult(null);
    const rest = s.queue.slice(1);
    if (rest.length > 0) {
      setStage({ ...s, queue: rest });
      return;
    }
    if (s.misses.length === 0) {
      setStage({ kind: "done" });
      onValidated?.();
    } else {
      setStage({ kind: "card", mode: "review", queue: s.misses, carriedOver: [] });
    }
  }

  if (stage.kind === "card") {
    const current = stage.queue[0];
    const done = data.toIntroduce.length + data.toTest.length - stage.queue.length - stage.carriedOver.length;
    return (
      <div className="space-y-5">
        {stage.mode === "review" ? (
          <p className="text-center text-sm text-amber-300">
            {stage.queue.length} mot{stage.queue.length > 1 ? "s" : ""} à revoir avant de retester
          </p>
        ) : (
          <Progress label={label} done={Math.max(0, done)} total={totalWords} />
        )}
        <WordFlashcard word={current} />
        <div className="text-center">
          <Button
            size="lg"
            disabled={isBusy}
            onClick={() => (stage.mode === "introduce" ? handleIntroduce(stage) : handleReview(stage))}
          >
            {isBusy
              ? "…"
              : stage.mode === "introduce"
                ? "Mot suivant · j’ai vu ce mot"
                : "Suivant"}
          </Button>
        </div>
      </div>
    );
  }

  if (stage.kind === "test") {
    const current = stage.queue[0];
    const done = stage.roundSize - stage.queue.length;
    return (
      <div className="space-y-5">
        <Progress label={label} done={done} total={stage.roundSize} />
        <div className="glass-strong rounded-3xl p-8 text-center">
          <Badge variant="secondary" className="bg-white/10">
            {current.typeLabel}
          </Badge>
          <div className="font-display mt-4 text-4xl">{displayAccent(current.accented)}</div>
          <p className="mt-4 text-foreground/70">Traduis en français</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (result) nextAfterResult(stage);
              else submitAnswer(stage);
            }}
            className="mx-auto mt-4 max-w-sm"
          >
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="réponse en français…"
              autoFocus
              autoComplete="off"
              readOnly={!!result}
              className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${
                result ? (result.correct ? "ring-2 ring-emerald-400/60" : "ring-2 ring-red-400/60") : ""
              }`}
            />
            {result && (
              <p className={`mt-3 text-sm ${result.correct ? "text-emerald-300" : "text-red-300"}`}>
                {result.correct ? "Correct !" : `Réponse attendue : ${result.expected.join(" / ")}`}
              </p>
            )}
            <div className="mt-5 flex justify-center gap-3">
              {!result ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={isBusy}
                    onClick={() => dontKnow(stage)}
                  >
                    Je ne sais pas
                  </Button>
                  <Button type="submit" size="lg" disabled={isBusy}>
                    {isBusy ? "…" : "Vérifier"}
                  </Button>
                </>
              ) : (
                <Button type="submit" size="lg">
                  Suivant
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-10 text-center">
      <h2 className="text-xl font-semibold">{label} validé 🎉</h2>
      <p className="mt-2 text-foreground/65">
        Tous les mots de ce lot sont maîtrisés — reviens plus tard pour la suite.
      </p>
    </div>
  );
}

function WordFlashcard({ word }: { word: B1VocabWord }) {
  return (
    <div className="glass-strong rounded-3xl p-8 text-center">
      <Badge variant="secondary" className="bg-white/10">
        {word.typeLabel}
      </Badge>
      <div className="font-display mt-4 text-5xl">{displayAccent(word.accented)}</div>
      <div className="mt-4 text-xl text-foreground/70">
        {word.translationsFr || "— pas encore de traduction française —"}
      </div>
    </div>
  );
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-foreground/55 tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-500 ease-out"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
