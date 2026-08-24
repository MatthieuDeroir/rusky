"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  getVocabCardAction,
  submitVocabAction,
  refineVocabVerdictAction,
  type VocabCard as VocabCardData,
  type VocabDirection,
  type PracticeResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";
import { LevelPips } from "@/components/level-pips";
import { LevelFilter } from "@/components/level-filter";
import { useVerifyPile, VerifyPile } from "@/components/verify-pile";

/** Vert = exact ; ambre = accepté avec réserve (faute de frappe ou « oui mais ») ; rouge = faux. */
function ringClass(result: PracticeResult | null): string {
  if (!result) return "";
  if (!result.correct) return "ring-2 ring-red-400/60";
  return result.tolerated || result.close
    ? "ring-2 ring-amber-400/60"
    : "ring-2 ring-emerald-400/60";
}

export function VocabCard({
  level: initialLevel,
  mistakesOnly,
  entryIds,
  emptyMessage,
}: {
  /** Niveau initial (venu de la Collection via l'URL) — reste modifiable ensuite dans la carte. */
  level?: number;
  /** true = ne piocher que dans les mots dont la dernière tentative (ce sens) était fausse. */
  mistakesOnly?: boolean;
  /** Restreint le tirage à ces entrées précises (ex. cohorte du parcours B1, §L). */
  entryIds?: number[];
  /** Message affiché à la place du texte générique quand il n'y a rien à réviser. */
  emptyMessage?: string;
}) {
  const [direction, setDirection] = useState<VocabDirection>("ru-fr");
  const [level, setLevel] = useState<number | undefined>(initialLevel);
  const [card, setCard] = useState<VocabCardData | "empty" | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [isChecking, startCheck] = useTransition();
  const answerRef = useRef<HTMLInputElement>(null);
  const verify = useVerifyPile(refineVocabVerdictAction);
  const cardGen = useRef(0);

  const load = useCallback(
    (exclude?: string) => {
      startLoad(async () => {
        const c = await getVocabCardAction(direction, exclude, level, mistakesOnly, entryIds);
        cardGen.current += 1;
        setCard(c);
        setAnswer("");
        setResult(null);
        setTimeout(() => answerRef.current?.focus(), 0);
      });
    },
    [direction, level, mistakesOnly, entryIds],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Champ vide accepté volontairement : "Je ne sais pas" (bouton dédié) ou Entrée sans rien écrit
  // doivent compter comme une réponse (fausse, sans appel IA), pas rester sans effet. `forced`
  // permet au bouton de soumettre vide même si du texte est déjà tapé (setState est différé).
  function check(forced?: string) {
    if (!card || card === "empty" || result) return;
    const gen = cardGen.current;
    const askedAnswer = (forced ?? answer).trim();
    startCheck(async () => {
      const r = await submitVocabAction({
        entryId: card.entryId,
        direction,
        answer: askedAnswer,
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
      showXpToast(r.xp);
      const label = displayAccent(card.accented);
      if (r.pending && r.refineToken) {
        verify.enqueue(r.refineToken, label, askedAnswer, (final) => {
          if (cardGen.current === gen) setResult(final);
          if (final.correct) setScore((s) => ({ right: s.right + 1, total: s.total }));
        });
      } else {
        verify.record(label, askedAnswer, r);
      }
    });
  }

  const toRussian = direction === "fr-ru";

  const directionToggle = (
    <div className="mx-auto flex w-fit gap-1 rounded-xl bg-white/5 p-1">
      {(
        [
          ["ru-fr", "Russe → Français"],
          ["fr-ru", "Français → Russe"],
        ] as [VocabDirection, string][]
      ).map(([dir, label]) => (
        <button
          key={dir}
          type="button"
          onClick={() => {
            if (dir === direction) return;
            setScore({ right: 0, total: 0 });
            setDirection(dir);
          }}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            direction === dir
              ? "bg-primary/40 text-foreground"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (card === "empty") {
    return (
      <div className="space-y-4">
        {directionToggle}
        <LevelFilter value={level} onChange={setLevel} />
        <div className="glass-strong rounded-3xl p-10 text-center">
          <h2 className="text-xl font-semibold">
            {emptyMessage ? "Rien pour l’instant" : mistakesOnly ? "Aucune erreur en attente 🎉" : "Rien à traduire pour l’instant"}
          </h2>
          <p className="mt-2 text-foreground/65">
            {emptyMessage ??
              (mistakesOnly
                ? "Tous tes derniers essais dans ce sens sont réussis — reviens ici après une session de Traduire."
                : "Ajoute des mots à ta collection (avec une traduction française) pour t’entraîner.")}
          </p>
          {!mistakesOnly && !entryIds && (
            <Button render={<Link href="/add" />} nativeButton={false} className="mt-6">
              Ajouter un mot
            </Button>
          )}
        </div>
        <VerifyPile pile={verify.history} />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="space-y-4">
        {directionToggle}
        <p className="text-center text-sm text-foreground/50">Chargement…</p>
        <VerifyPile pile={verify.history} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {directionToggle}

      <div className="flex items-center justify-between gap-3">
        <LevelFilter value={level} onChange={setLevel} />
        <span className="shrink-0 text-sm text-foreground/55">
          {score.right}/{score.total}
        </span>
      </div>

      <div className="glass-strong rounded-3xl p-8 text-center">
        <Badge variant="secondary" className="bg-white/10">
          {card.typeLabel}
        </Badge>

        <div className={`mt-4 ${toRussian ? "text-3xl font-medium" : "font-display text-5xl"}`}>
          {toRussian ? card.translationsFr : displayAccent(card.accented)}
        </div>
        <div className="mt-6 text-foreground/70">
          {toRussian ? "Écris le mot en russe" : "Traduis en français"}
        </div>
        <p className="mt-1 text-xs text-foreground/40">
          Forme du dictionnaire — rien à décliner ni à conjuguer.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (result) load(String(card.entryId));
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
              autoComplete="off"
              spellCheck={false}
              readOnly={!!result}
              className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${ringClass(result)}`}
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
              className={`h-14 border-white/15 bg-white/5 text-center text-2xl ${ringClass(result)}`}
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
                      : result.tolerated
                        ? "Accepté (petite imprécision) 👍"
                        : "Correct !"}
                  </p>
                  {result.close && result.note && (
                    <p className="mt-1 text-xs text-amber-200/70">{result.note}</p>
                  )}
                  {(result.tolerated || result.close) && (
                    <p className="mt-1 text-xs text-foreground/45">
                      Réponse exacte :{" "}
                      <span className="font-medium">
                        {result.expected
                          .map((v) => (toRussian ? displayAccent(v) : v))
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
                      {result.expected.map((v) => (toRussian ? displayAccent(v) : v)).join(" / ")}
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
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={isChecking}
                  onClick={() => {
                    setAnswer("");
                    check("");
                  }}
                >
                  Je ne sais pas
                </Button>
                <Button type="submit" size="lg" disabled={isChecking}>
                  {isChecking ? "Vérification…" : "Vérifier"}
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
      <VerifyPile pile={verify.history} />
    </div>
  );
}
