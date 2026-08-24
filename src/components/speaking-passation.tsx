"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import {
  finishAttemptAction,
  submitSpeakingResponseAction,
  type PassationData,
  type PassationItem,
} from "@/app/objectif-b1/actions";
import { getRecognitionCtor, noopSubscribe, type Recognition } from "@/lib/exam/asr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

type Phase = "prep" | "recording" | "submitting" | "feedback";

const CRITERION_LABEL: Record<string, string> = {
  realisation: "Réalisation de la tâche",
  grammar: "Grammaire",
  lexis: "Lexique",
  fluency: "Fluidité",
  coherence: "Cohérence",
};

/** Passation говорение (§F du plan) : préparation chronométrée → enregistrement chronométré
 * (Web Speech API, §7.3/ADR 0005) → transcript soumis au rater dès la fin de la réponse (aucun
 * appel Mistral pendant la génération du sujet — mais ici, contrairement au QCM, la note ne peut
 * exister qu'une fois la réponse orale produite). Non interruptible une fois le chrono de
 * préparation lancé, comme à l'examen réel (§9 du spec). */
export function SpeakingPassation({ data, paperId }: { data: PassationData; paperId: number }) {
  const router = useRouter();
  const micSupported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );

  const [index, setIndex] = useState(0);
  const item = data.items[index];
  const [phase, setPhase] = useState<Phase>("prep");
  const [remaining, setRemaining] = useState(item?.prepSec ?? 60);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [manualAnswer, setManualAnswer] = useState(""); // repli si l'ASR n'est pas supportée
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof submitSpeakingResponseAction>> | null>(
    null,
  );
  const [finishing, setFinishing] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const startedAtRef = useRef(0);

  // Chrono d'1s, actif pendant prep et recording seulement.
  useEffect(() => {
    if (phase !== "prep" && phase !== "recording") return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Transition automatique à 0 — enveloppée dans un microtask pour ne jamais poser de setState
  // synchrone en tête d'effet (voir react-hooks/set-state-in-effect, déjà rencontré côté examens).
  useEffect(() => {
    if (remaining > 0) return;
    if (phase === "prep") Promise.resolve().then(() => startRecording());
    else if (phase === "recording") Promise.resolve().then(() => stopRecording());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase]);

  useEffect(() => () => recRef.current?.stop(), []);

  function startRecording() {
    setPhase("recording");
    setRemaining(item.responseSec ?? 60);
    setTranscript("");
    setInterim("");
    startedAtRef.current = Date.now();
    const Ctor = getRecognitionCtor();
    if (!Ctor) return; // pas de support ASR : le candidat tape sa réponse (repli texte, voir UI)
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "";
      let intm = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else intm += r[0].transcript;
      }
      if (fin) {
        setTranscript((prev) => (prev ? prev + " " : "") + fin.trim());
        setInterim("");
      } else {
        setInterim(intm);
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {};
    recRef.current = rec;
    rec.start();
  }

  function stopRecording() {
    recRef.current?.stop();
    recRef.current = null;
    const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    setPhase("submitting");
    const finalTranscript = (transcript + " " + interim).trim() || manualAnswer.trim();
    submitSpeakingResponseAction({
      attemptId: data.attemptId,
      itemId: item.id,
      transcript: finalTranscript,
      durationSec,
    }).then((res) => {
      setLastResult(res);
      setPhase("feedback");
    });
  }

  function nextItem() {
    const nextIndex = index + 1;
    if (nextIndex < data.items.length) {
      setIndex(nextIndex);
      setPhase("prep");
      setRemaining(data.items[nextIndex].prepSec ?? 60);
      setTranscript("");
      setInterim("");
      setManualAnswer("");
      setLastResult(null);
      return;
    }
    setFinishing(true);
    finishAttemptAction(data.attemptId).then(() => {
      router.push(`/objectif-b1/examens/${paperId}/resultats?attemptId=${data.attemptId}`);
    });
  }

  if (!item) return null;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const totalForPhase = phase === "prep" ? item.prepSec ?? 60 : item.responseSec ?? 60;

  return (
    <div className="space-y-6">
      <div className="glass-strong sticky top-4 z-10 rounded-2xl p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Tâche {index + 1}/{data.items.length}
          </span>
          <span className={remaining < 10 && phase !== "feedback" ? "font-semibold text-red-400" : ""}>
            {phase === "prep" ? "Préparation" : phase === "recording" ? "Réponse" : ""}{" "}
            {phase === "prep" || phase === "recording" ? `${minutes}:${seconds.toString().padStart(2, "0")}` : ""}
          </span>
        </div>
        {(phase === "prep" || phase === "recording") && (
          <Progress value={(remaining / totalForPhase) * 100} className="mt-2">
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        )}
      </div>

      <ItemPrompt item={item} />

      {!micSupported && (phase === "prep" || phase === "recording") && (
        <p className="rounded-xl bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          Reconnaissance vocale non disponible sur ce navigateur — tape ta réponse ci-dessous à la
          place.
        </p>
      )}

      {phase === "prep" && (
        <div className="glass-strong rounded-3xl p-6 text-center">
          <p className="text-foreground/60">Prépare ta réponse — l’enregistrement démarre automatiquement.</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="glass-strong rounded-3xl p-6">
          <div className="flex items-center justify-center gap-2 text-red-300">
            <Mic className="size-4 animate-pulse" />
            <span className="text-sm font-medium">Enregistrement en cours…</span>
          </div>
          {micSupported ? (
            <p className="mt-4 min-h-16 text-center text-foreground/80">
              {transcript}
              {interim && <span className="text-foreground/40"> {interim}…</span>}
              {!transcript && !interim && (
                <span className="text-foreground/40">(parle maintenant)</span>
              )}
            </p>
          ) : (
            <textarea
              value={manualAnswer}
              onChange={(e) => setManualAnswer(e.target.value)}
              placeholder="Tape ta réponse ici…"
              className="mt-4 h-32 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-foreground"
              autoFocus
            />
          )}
          <div className="mt-4 text-center">
            <Button variant="secondary" onClick={stopRecording}>
              Terminer ma réponse maintenant
            </Button>
          </div>
        </div>
      )}

      {phase === "submitting" && (
        <p className="text-center text-sm text-foreground/50">Correction en cours…</p>
      )}

      {phase === "feedback" && lastResult && (
        <div className="glass-strong rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Retour</h3>
            <Badge variant="secondary">
              {lastResult.pointsAwarded}/{lastResult.maxPoints} pts
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(lastResult.feedback.scores).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="bg-white/10">
                {CRITERION_LABEL[k] ?? k} : {v}/5
              </Badge>
            ))}
          </div>
          {lastResult.feedback.comment && (
            <p className="mt-3 text-sm text-foreground/70">{lastResult.feedback.comment}</p>
          )}
          {lastResult.feedback.errors.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {lastResult.feedback.errors.map((e, i) => (
                <li key={i} className="rounded-lg bg-red-400/10 px-3 py-2">
                  <span className="text-red-300 line-through">{e.span}</span>
                  {" → "}
                  <span className="text-emerald-300">{e.correction}</span>
                  {e.explanationFr && (
                    <span className="ml-2 text-foreground/50">({e.explanationFr})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-foreground/40">
            Score indicatif — prononciation et intonation ne sont pas évaluées de façon fiable par
            cette chaîne (transcript automatique).
          </p>
          <Button size="lg" className="mt-4" disabled={finishing} onClick={nextItem}>
            {finishing
              ? "Correction…"
              : index + 1 < data.items.length
                ? "Tâche suivante"
                : "Voir les résultats"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemPrompt({ item }: { item: PassationItem }) {
  return (
    <div className="glass rounded-2xl p-5">
      {item.supportText && (
        <p className="mb-3 rounded-xl bg-white/5 p-3 text-sm text-foreground/70">{item.supportText}</p>
      )}
      <p className="text-lg">{item.instructions}</p>
      {item.stimuli && (
        <ol className="mt-3 space-y-1.5 text-sm text-foreground/80">
          {item.stimuli.map((s, i) => (
            <li key={i}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
