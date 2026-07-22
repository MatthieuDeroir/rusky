"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Mic, Square, Check, Volume2, RefreshCw } from "lucide-react";
import {
  generateExamItemAction,
  gradeExamAction,
  type GradeProductionResult,
} from "@/app/actions";
import { getRecognitionCtor, noopSubscribe, type Recognition } from "@/lib/speech";
import { displayAccent } from "@/lib/grammar";
import { SKILL_LABEL, type ExamItem, type ProductionTask } from "@/lib/torfl";
import { speakRussian } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ProductionExam({ task, passed }: { task: ProductionTask; passed: boolean }) {
  const isProduction = task.skill === "ecrit" || task.skill === "oral";
  const isComprehension = task.skill === "lecture" || task.skill === "ecoute";
  const isGrammar = task.skill === "grammaire";
  const usesMic = task.skill === "oral";

  const [item, setItem] = useState<ExamItem | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<GradeProductionResult | null>(null);
  const [listening, setListening] = useState(false);
  const [isGenerating, startGen] = useTransition();
  const [isGrading, startGrade] = useTransition();
  const recRef = useRef<Recognition | null>(null);

  const micSupported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );

  function generate() {
    setItemError(null);
    setResult(null);
    setText("");
    setAnswers([]);
    startGen(async () => {
      const r = await generateExamItemAction(task.id);
      if (r.error || !r.item) setItemError(r.error ?? "Erreur");
      else setItem(r.item);
    });
  }

  function startMic() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalTxt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript;
      }
      if (finalTxt.trim()) setText((t) => (t ? `${t} ` : "") + finalTxt.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }
  function stopMic() {
    recRef.current?.stop();
    setListening(false);
  }

  function submit() {
    stopMic();
    startGrade(async () => {
      const r = await gradeExamAction({
        taskId: task.id,
        response: isProduction ? text.trim() : undefined,
        answers: isComprehension || isGrammar ? answers : undefined,
        item: item ?? undefined,
      });
      setResult(r);
    });
  }

  const canSubmit = isGrammar
    ? (item?.mcq?.length ?? 0) > 0 && answers.filter((a) => a !== undefined && a !== "").length === item!.mcq!.length
    : isComprehension
      ? answers.some((a) => a?.trim())
      : !!text.trim();

  const needsItem = task.generated && !item;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="bg-white/10">
          {SKILL_LABEL[task.skill]}
        </Badge>
        {passed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200 ring-1 ring-emerald-400/50">
            <Check className="size-3" /> validée
          </span>
        )}
      </div>
      <h3 className="mt-2 font-medium">{task.titleFr}</h3>
      <p className="mt-1 text-sm text-foreground/65">{task.promptFr}</p>
      {task.minWords && (
        <p className="mt-1 text-xs text-foreground/40">≈ {task.minWords} mots attendus</p>
      )}

      {needsItem ? (
        <div className="mt-4">
          <Button onClick={generate} disabled={isGenerating}>
            {isGenerating ? "Génération…" : "Générer l’épreuve"}
          </Button>
          {itemError && <p className="mt-2 text-sm text-red-300">Erreur : {itemError}</p>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Reading: show the Russian text */}
          {task.skill === "lecture" && item?.passage && (
            <div className="rounded-xl bg-white/5 p-3 text-base leading-relaxed">
              {displayAccent(item.passage)}
            </div>
          )}

          {/* Listening: hidden text, playable audio */}
          {task.skill === "ecoute" && item?.passage && (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <button
                type="button"
                onClick={() => speakRussian(item.passage!)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary/25 px-3 py-2 text-sm ring-1 ring-primary/40 hover:bg-primary/35"
              >
                <Volume2 className="size-4" /> Écouter le texte
              </button>
              <span className="text-xs text-foreground/40">Texte masqué — écoute puis réponds.</span>
            </div>
          )}

          {/* Comprehension: one field per question */}
          {isComprehension && (
            <div className="space-y-2">
              {(item?.questions ?? []).map((q, i) => (
                <div key={i}>
                  <label className="text-sm text-foreground/75">{q}</label>
                  <input
                    value={answers[i] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => {
                        const n = [...a];
                        n[i] = e.target.value;
                        return n;
                      })
                    }
                    placeholder="ta réponse (en français)…"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Lexico-grammar QCM */}
          {isGrammar && (
            <div className="space-y-3">
              {(item?.mcq ?? []).map((q, i) => (
                <div key={i} className="rounded-xl bg-white/5 p-3">
                  <div className="text-sm">
                    {i + 1}. {displayAccent(q.question)}
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    {q.options.map((opt, j) => (
                      <label
                        key={j}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 transition-colors ${
                          answers[i] === String(j)
                            ? "bg-primary/25 ring-primary/40"
                            : "bg-white/5 ring-transparent hover:bg-white/10"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${task.id}-q${i}`}
                          checked={answers[i] === String(j)}
                          onChange={() =>
                            setAnswers((a) => {
                              const n = [...a];
                              n[i] = String(j);
                              return n;
                            })
                          }
                          className="accent-primary"
                        />
                        {displayAccent(opt)}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Production: free-text answer (+ mic for oral) */}
          {isProduction && (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={usesMic ? "écris ou dicte ta réponse en russe…" : "ta réponse en russe…"}
                rows={6}
                spellCheck={false}
                className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-base leading-relaxed outline-none focus:border-primary/50"
              />
              {usesMic && micSupported && (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={listening ? stopMic : startMic}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
                      listening
                        ? "bg-red-500/25 text-red-200 ring-1 ring-red-400/40"
                        : "bg-white/10 text-foreground/70 hover:bg-white/20"
                    }`}
                  >
                    {listening ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
                    {listening ? "Arrêter" : "Dicter"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {task.generated && (
              <Button
                variant="secondary"
                className="bg-white/10"
                onClick={generate}
                disabled={isGenerating}
              >
                <RefreshCw className="size-4" /> Nouvelle épreuve
              </Button>
            )}
            <Button onClick={submit} disabled={isGrading || !canSubmit}>
              {isGrading ? "Correction…" : passed ? "Repasser l’épreuve" : "Soumettre"}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3 rounded-xl bg-white/5 p-4">
          {result.error ? (
            <p className="text-sm text-red-300">Erreur : {result.error}</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={`text-lg font-semibold ${
                    result.pass ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {result.pass ? "Réussi ✅" : "Pas encore"} · {result.score}/100
                </span>
                {result.pass && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-300">
                    <Check className="size-4" /> épreuve validée
                  </span>
                )}
              </div>
              {result.feedback && <p className="text-sm text-foreground/80">{result.feedback}</p>}
              {result.criteria.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {result.criteria.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-medium text-foreground/70">
                        {c.name} {c.score}/5 —
                      </span>
                      <span className="text-foreground/70">{c.comment}</span>
                    </li>
                  ))}
                </ul>
              )}
              {task.skill === "ecoute" && item?.passage && (
                <details className="group rounded-lg bg-white/5 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-foreground/60 hover:text-foreground">
                    Voir le texte
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/85">
                    {displayAccent(item.passage)}
                  </p>
                </details>
              )}
              {result.corrected && (
                <details className="group rounded-lg bg-white/5 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-foreground/60 hover:text-foreground">
                    {isGrammar
                      ? "Corrigé"
                      : isComprehension
                        ? "Réponses attendues"
                        : "Voir une version corrigée"}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/85">
                    {result.corrected}
                  </p>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
