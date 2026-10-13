"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { getTextStateAction } from "@/app/lire/actions";
import { finishDecodeAction } from "@/app/seance/actions";
import { showXpToast } from "@/lib/xp-toast";
import { ROLE_LABEL, type ReaderAnalysis, type ReadingStatus, type Role } from "@/lib/reader/types";
import { SentenceLine } from "./reader";
import { ROLE_TEXT } from "./roles";
import { Button } from "@/components/ui/button";

const STEPS: { role: Role; prompt: string }[] = [
  { role: "verb", prompt: "Touche un verbe (conjugué ou infinitif)." },
  { role: "subject", prompt: "Touche le sujet — le mot au nominatif qui fait l’action." },
  { role: "object", prompt: "Touche le COD — ce qui subit l’action (accusatif, ou génitif après une négation)." },
  { role: "indirect", prompt: "Touche le complément au datif — à qui / pour qui." },
];

/** Phrase à décortiquer : on trouve soi-même verbe, sujet, COD… en touchant les mots, AVANT de
 * voir la structure. C'est l'exercice qui entraîne le réflexe « terminaison → fonction ». */
export function DecodeCard(props: {
  textId: number;
  initialStatus: ReadingStatus;
  initialAnalysis: ReaderAnalysis | null;
  initiallyDone: boolean;
}) {
  const [status, setStatus] = useState(props.initialStatus);
  const [analysis, setAnalysis] = useState(props.initialAnalysis);
  const [step, setStep] = useState(0);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const [done, setDone] = useState(props.initiallyDone);
  const [, start] = useTransition();

  const ready = status === "READY" || status === "FAILED";
  useEffect(() => {
    if (ready) return;
    const id = setInterval(async () => {
      try {
        const st = await getTextStateAction(props.textId);
        setStatus(st.status);
        setAnalysis(st.analysis);
      } catch {}
    }, 2500);
    return () => clearInterval(id);
  }, [ready, props.textId]);

  const sentence = analysis?.paragraphs[0]?.sentences?.[0] ?? null;
  const steps = useMemo(
    () => (sentence ? STEPS.filter((s) => sentence.words.some((w) => w.role === s.role)) : []),
    [sentence],
  );

  if (!ready || !sentence)
    return <p className="animate-pulse text-sm text-foreground/55">Préparation de la phrase du jour…</p>;
  if (status === "FAILED") return <p className="text-sm text-red-300">La phrase du jour n’a pas pu être préparée.</p>;

  const finished = done || step >= steps.length;
  const current = steps[step];

  const pick = (w: number) => {
    if (finished || !current) return;
    const word = sentence.words[w];
    if (word.role === current.role) {
      // Tous les mots du groupe (adjectif + nom) s'allument d'un coup.
      const group = sentence.words.map((x, i) => (x.role === current.role ? i : -1)).filter((i) => i >= 0);
      setFound((f) => new Set([...f, ...group]));
      setWrong(null);
      const next = step + 1;
      setStep(next);
      if (next >= steps.length) {
        setDone(true);
        start(async () => {
          const { xp } = await finishDecodeAction(props.textId, misses === 0);
          showXpToast(xp);
        });
      }
    } else {
      setWrong(w);
      setMisses((m) => m + 1);
    }
  };

  return (
    <div className="space-y-3">
      {finished ? (
        <SentenceLine sentence={sentence} structure accents={false} selected={null} onPick={() => {}} />
      ) : (
        <p className="font-display text-xl leading-loose">
          {sentence.tokens.map((tok, i) =>
            tok.w === undefined ? (
              <span key={i}>{tok.t}</span>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => pick(tok.w!)}
                className={`rounded-md px-0.5 transition-colors hover:bg-white/10 ${
                  found.has(tok.w) ? ROLE_TEXT[sentence.words[tok.w].role] : ""
                } ${wrong === tok.w ? "bg-red-400/20" : ""}`}
              >
                {tok.t}
              </button>
            ),
          )}
        </p>
      )}

      {!finished && current && (
        <div className="space-y-1">
          <p className={`text-sm font-medium ${ROLE_TEXT[current.role]}`}>
            {step + 1}/{steps.length} · {current.prompt}
          </p>
          {wrong !== null && (
            <p className="text-sm text-foreground/60">
              Pas celui-là : « {sentence.words[wrong].raw} » est {ROLE_LABEL[sentence.words[wrong].role].toLowerCase()}
              {sentence.words[wrong].reason ? ` (${sentence.words[wrong].reason})` : ""}.
            </p>
          )}
          {misses >= 3 && (
            <Button size="sm" variant="ghost" onClick={() => setStep(steps.length)}>
              Voir la solution
            </Button>
          )}
        </div>
      )}

      {finished && (
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-1.5 text-emerald-300">
            <Check className="size-4" /> {misses === 0 ? "Parfait, du premier coup." : `Trouvé (${misses} erreur${misses > 1 ? "s" : ""}).`}
          </p>
          {sentence.skeleton && <p className="text-foreground/60">{sentence.skeleton}</p>}
          {sentence.literal && <p className="italic text-foreground/50">{sentence.literal}</p>}
          {sentence.translation && <p className="text-foreground/85">{sentence.translation}</p>}
        </div>
      )}
    </div>
  );
}
