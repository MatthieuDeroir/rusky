"use client";

import { useState, useTransition } from "react";
import { checkSentenceAction, type SentenceCheck } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { RussianInput } from "@/components/russian-keyboard";

const CASE_ABBR: Record<string, string> = {
  nom: "nom.",
  gen: "gén.",
  dat: "dat.",
  acc: "acc.",
  inst: "inst.",
  prep: "prép.",
};

export function PhraseCard() {
  const [sentence, setSentence] = useState("");
  const [result, setResult] = useState<SentenceCheck | null>(null);
  const [isChecking, startCheck] = useTransition();

  function check() {
    if (!sentence.trim()) return;
    startCheck(async () => {
      setResult(await checkSentenceAction(sentence));
    });
  }

  const issueIdx = new Set(result?.issues.map((i) => i.index) ?? []);
  const clean = result && result.issues.length === 0 && result.tokens.every((t) => t.recognized);

  return (
    <div className="space-y-5">
      <div className="glass-strong rounded-3xl p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
          className="space-y-4"
        >
          <RussianInput
            value={sentence}
            onValueChange={(v) => {
              setSentence(v);
              setResult(null);
            }}
            placeholder="Écris une phrase en russe…"
            autoFocus
            spellCheck={false}
            className="h-14 border-white/15 bg-white/5 text-xl"
          />
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={isChecking || !sentence.trim()}>
              {isChecking ? "Analyse…" : "Vérifier"}
            </Button>
          </div>
        </form>
      </div>

      {result && result.tokens.length > 0 && (
        <div className="space-y-4">
          {/* Word-by-word analysis */}
          <div className="glass flex flex-wrap gap-2 rounded-2xl p-4">
            {result.tokens.map((t, i) => {
              return (
                <div
                  key={i}
                  className={`rounded-xl border px-3 py-2 text-center ${
                    !t.recognized
                      ? "border-red-400/50 bg-red-400/10"
                      : issueIdx.has(i)
                        ? "border-amber-400/50 bg-amber-400/10"
                        : "border-white/12 bg-white/5"
                  }`}
                >
                  <div className="font-display text-lg">{t.raw}</div>
                  <div className="mt-0.5 text-[11px] text-foreground/55">
                    {!t.recognized
                      ? "inconnu"
                      : [t.pos, t.cases.map((c) => CASE_ABBR[c]).join("/")]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Verdict + issues */}
          {clean ? (
            <div className="glass rounded-2xl p-4 text-sm text-emerald-300">
              Aucun problème de cas détecté. 👍
              <span className="mt-1 block text-xs text-foreground/50">
                (Vérification partielle : cas après prépositions, rection de certains verbes et
                accord adjectif-nom. La syntaxe complète n’est pas garantie.)
              </span>
            </div>
          ) : (
            <div className="glass space-y-2 rounded-2xl p-4">
              <h2 className="text-sm font-medium text-foreground/70">
                {result.issues.length + result.tokens.filter((t) => !t.recognized).length} point
                {result.issues.length > 1 ? "s" : ""} à revoir
              </h2>
              <ul className="space-y-1.5 text-sm text-foreground/85">
                {result.issues.map((iss, k) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-amber-300">•</span>
                    <span>{iss.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result && (
        <p className="text-center text-sm text-foreground/50">
          Compose une phrase avec les mots que tu connais ; l’app vérifie automatiquement les
          cas (prépositions, rection des verbes, accord adjectif-nom) et signale les mots
          introuvables.
        </p>
      )}
    </div>
  );
}
