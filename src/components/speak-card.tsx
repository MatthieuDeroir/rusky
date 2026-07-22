"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import {
  getSpeakQuestionAction,
  submitSpeakAction,
  type SpeakQuestion,
  type SpeakResult,
} from "@/app/actions";
import { displayAccent } from "@/lib/grammar";
import { getRecognitionCtor, noopSubscribe, type Recognition } from "@/lib/speech";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SpeakCard({ review = false }: { review?: boolean }) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );
  const [question, setQuestion] = useState<SpeakQuestion | null | "empty">(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [result, setResult] = useState<SpeakResult | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [isLoading, startLoad] = useTransition();
  const [, startCheck] = useTransition();
  const recRef = useRef<Recognition | null>(null);

  const load = useCallback(
    (exclude?: string) => {
      startLoad(async () => {
        const q = await getSpeakQuestionAction(exclude, review);
        setQuestion(q ?? "empty");
        setInterim("");
        setResult(null);
      });
    },
    [review],
  );

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => recRef.current?.stop(), []);

  function evaluate(q: SpeakQuestion, transcripts: string[]) {
    startCheck(async () => {
      const r = await submitSpeakAction({
        entryId: q.entryId,
        formKey: q.formKey,
        transcripts,
      });
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
    });
  }

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !question || question === "empty") return;
    const q = question;
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 6; // short words are ambiguous — keep several hypotheses
    const finalAlts: string[] = [];
    rec.onresult = (e) => {
      let intm = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          for (let j = 0; j < r.length; j++) finalAlts.push(r[j].transcript);
        } else {
          intm += r[0].transcript;
        }
      }
      setInterim(intm);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        toast.error("Micro refusé. Autorise l’accès au microphone.");
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (finalAlts.length) evaluate(q, finalAlts);
    };
    recRef.current = rec;
    setResult(null);
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  if (question === "empty") {
    return (
      <div className="glass-strong rounded-3xl p-10 text-center">
        <h2 className="text-xl font-semibold">
          {review ? "Rien à rattraper 🎉" : "Rien à prononcer pour l’instant"}
        </h2>
        <p className="mt-2 text-foreground/65">
          {review
            ? "Toutes les prononciations ratées ont été revues."
            : "Ajoute des mots à ta collection pour t’entraîner à les prononcer."}
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

  if (!supported) {
    return (
      <div className="glass-strong rounded-3xl p-8 text-center">
        <p className="text-amber-200">
          La reconnaissance vocale n’est pas disponible dans ce navigateur. Essaie Chrome ou
          Edge.
        </p>
      </div>
    );
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
        <div className="mt-6 text-foreground/70">Prononce ce mot :</div>
        <div className="mt-2 font-display text-5xl">{displayAccent(question.promptRu)}</div>
        <div className="mt-1 text-sm text-foreground/55">{question.formLabel}</div>
        {question.translationsFr && (
          <div className="mt-1 text-sm text-foreground/45">{question.translationsFr}</div>
        )}

        <div className="mt-7 flex flex-col items-center gap-3">
          {!result ? (
            <Button
              type="button"
              size="lg"
              variant={listening ? "destructive" : "default"}
              onClick={listening ? stop : start}
              className="gap-2"
            >
              {listening ? (
                <>
                  <Square className="h-4 w-4" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-300" />
                  J’écoute…
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Parler
                </>
              )}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={() => load(`${question.entryId}|${question.formKey ?? ""}`)} disabled={isLoading}>
              {isLoading ? "…" : "Suivant"}
            </Button>
          )}

          {interim && !result && (
            <p className="text-sm italic text-foreground/40">{interim}…</p>
          )}

          {result && (
            <div className="space-y-1">
              <p className="text-sm text-foreground/55">
                Entendu : <span className="font-medium text-foreground/80">{result.heard || "—"}</span>
              </p>
              {result.correct ? (
                <p className="text-emerald-300">Bien prononcé ! 🎉</p>
              ) : (
                <p className="text-red-300">
                  Attendu :{" "}
                  <span className="font-semibold">
                    {result.expected.map((v) => displayAccent(v)).join(" / ")}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-foreground/40">
        L’accent n’est pas exigé ; la reconnaissance vocale tolère des variantes.
      </p>
    </div>
  );
}
