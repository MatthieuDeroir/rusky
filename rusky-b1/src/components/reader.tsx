"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  answerQuestionAction,
  completeTextAction,
  keepWordAction,
  newDailyTextAction,
  newPracticeTextAction,
  openTextAction,
  retryTextAction,
  textStateAction,
  type TextState,
} from "@/app/actions";
import { CLAUSE_LABEL, ROLE_LABEL, type ReaderSentence, type ReaderWord } from "@/lib/reader/types";
import { CASE_LABELS, caseOf, type CaseCode } from "@/lib/grammar";
import type { ComprehensionQuestion, TextAnswer } from "@/lib/texts";
import { Button, TYPE_FR } from "@/components/ui";
import { cn } from "@/lib/utils";

// Une couleur par cas : le sujet, le COD, le « à qui »… se lisent à la terminaison, et les
// adjectifs prennent la couleur de leur nom (même cas). Les verbes ont la leur.
type Tint = CaseCode | "verb" | "preposition";
const TINT_COLOR: Record<Tint, string> = {
  nom: "text-[#1f6fd1] dark:text-[#7cb6ff]",
  acc: "text-[#b3195f] dark:text-[#ff7fb5]",
  gen: "text-[#8b5e34] dark:text-[#e0b07e]",
  dat: "text-[#0f8a5f] dark:text-[#4fd6a0]",
  inst: "text-[#0e7490] dark:text-[#5fd0e6]",
  prep: "text-[#7c3aed] dark:text-[#b69aff]",
  verb: "text-[#c2410c] dark:text-[#ff9a5c]",
  preposition: "text-faint",
};
/** Le cas et ce qu'il dit dans la phrase. */
const TINT_LABEL: Record<Tint, string> = {
  nom: "Sujet (nominatif)",
  acc: "COD (accusatif)",
  gen: "De qui, de quoi (génitif)",
  dat: "À qui (datif)",
  inst: "Avec quoi, par qui (instrumental)",
  prep: "Où, de quoi on parle (prépositionnel)",
  verb: "Verbe",
  preposition: "Préposition",
};
const LEGEND: Tint[] = ["nom", "acc", "gen", "dat", "inst", "prep", "verb"];
const DECLINED = new Set(["noun", "adjective", "pronoun", "numeral"]);

/** Cas d'un mot décliné dans la phrase. La forme du dictionnaire (formKey nul) est le nominatif ;
 * quand nominatif et accusatif s'écrivent pareil (стол, книги), c'est la fonction qui tranche. */
function tintOf(w: ReaderWord): Tint | null {
  if (w.role === "verb" && w.type === "verb") return "verb";
  if (w.role === "preposition") return "preposition";
  if (!w.type || !DECLINED.has(w.type)) return w.type === "verb" ? "verb" : null;
  let c: CaseCode | null = w.formKey ? caseOf(w.formKey) : "nom";
  if (c === "nom" && w.role === "object") c = "acc";
  if (c === "acc" && w.role === "subject") c = "nom";
  return c;
}

interface Selection {
  p: number;
  s: number;
  w: number;
}

export function Reader({
  textId,
  initial,
  collected,
  attribution,
  onFinished,
  finishLabel = "J’ai fini ce texte",
}: {
  textId: number;
  initial: TextState;
  collected: number[];
  attribution?: string | null;
  onFinished?: () => void;
  finishLabel?: string;
}) {
  const [state, setState] = useState(initial);
  const [structure, setStructure] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [kept, setKept] = useState(() => new Set(collected));
  const [pending, start] = useTransition();

  const waiting = ["GENERATING", "PENDING", "ANALYZING"].includes(state.status);
  const needsQuestions = state.status === "READY" && state.questions.length === 0;
  // Préparation interrompue (redémarrage, délai dépassé) : au-delà de 2 min 30, on propose de relancer.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setStuck(true), 150_000);
    return () => clearTimeout(t);
  }, [waiting]);
  const relaunch = () =>
    start(async () => {
      setStuck(false);
      try {
        await retryTextAction(textId);
        setState(await textStateAction(textId));
      } catch {
        toast.error("La relance n’a pas pu partir. Réessaie.");
      }
    });
  const stuckNotice =
    waiting && stuck ? (
      <div className="space-y-2 rounded-2xl bg-learning-soft p-4 font-sans text-[16px]">
        <p>La préparation prend plus de temps que prévu. Elle a peut-être été interrompue.</p>
        <Button variant="secondary" onClick={relaunch} disabled={pending}>
          Relancer la préparation
        </Button>
      </div>
    ) : null;

  useEffect(() => {
    openTextAction(textId).catch(() => {});
  }, [textId]);

  // Suivi de la génération / de l'analyse (les paragraphes arrivent au fil de l'eau).
  useEffect(() => {
    if (!waiting && !needsQuestions) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try {
        setState(await textStateAction(textId));
      } catch {}
      if (needsQuestions && tries > 20) clearInterval(id);
    }, 2500);
    return () => clearInterval(id);
  }, [waiting, needsQuestions, textId]);

  const paragraphs = state.analysis?.paragraphs ?? [];
  const sentence = sel ? paragraphs[sel.p]?.sentences?.[sel.s] : null;
  const word = sentence && sel ? sentence.words[sel.w] : null;
  const allAnswered = state.questions.length > 0 && state.questions.every((q) => q.id in state.answers);
  // Mots nouveaux pour l'apprenant (ni connus, ni en cours, ni mots-outils) — moins ceux qu'il vient de garder.
  const fresh = new Set((state.coverage?.newEntryIds ?? []).filter((id) => !kept.has(id)));
  const freshCount = fresh.size;

  // Navigation mot à mot dans tout le texte.
  const flat: Selection[] = paragraphs.flatMap((p, pi) =>
    (p.sentences ?? []).flatMap((s, si) => s.words.map((_, wi) => ({ p: pi, s: si, w: wi }))),
  );
  const pos = sel ? flat.findIndex((x) => x.p === sel.p && x.s === sel.s && x.w === sel.w) : -1;

  if (state.status === "GENERATING" || (!state.analysis && waiting)) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="ru animate-pulse text-2xl text-muted">Пишем текст…</p>
        <p className="text-muted">Le texte du jour s’écrit à ton niveau. Ça prend environ une minute.</p>
        {stuckNotice}
      </div>
    );
  }
  if (state.status === "FAILED" && !state.analysis?.paragraphs.some((p) => p.sentences)) {
    return (
      <div className="space-y-3 rounded-2xl bg-wrong-soft p-5">
        <p>Le texte n’a pas pu être préparé{state.error ? ` (${state.error})` : ""}.</p>
        <Button variant="secondary" onClick={() => start(async () => { await retryTextAction(textId); setState(await textStateAction(textId)); })} disabled={pending}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="ru text-[28px] leading-tight font-semibold">{state.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStructure((v) => !v)}
            aria-pressed={structure}
            className={cn(
              "rounded-full px-3 py-1 text-[15px] transition-colors",
              structure ? "bg-cobalt text-cobalt-ink" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--line)]",
            )}
          >
            Qui fait quoi
          </button>
          {freshCount > 0 && (
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              aria-pressed={showNew}
              className={cn(
                "rounded-full px-3 py-1 text-[15px] transition-colors",
                showNew ? "bg-learning text-white dark:text-[#1d1403]" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--line)]",
              )}
            >
              Mots nouveaux
            </button>
          )}
          {structure && (
            <span className="flex flex-wrap gap-x-3 text-[14px]">
              {LEGEND.map((t) => (
                <span key={t} className={TINT_COLOR[t]}>
                  {TINT_LABEL[t]}
                </span>
              ))}
            </span>
          )}
        </div>
        {state.coverage && state.coverage.total > 0 && (
          <p className="text-[15px]">
            Tu connais <span className="font-semibold">{Math.round((state.coverage.known / state.coverage.total) * 100)} %</span> des
            mots de ce texte
            {freshCount > 0 ? `, ${freshCount} ${freshCount > 1 ? "sont nouveaux" : "est nouveau"} pour toi.` : "."}
            {(() => {
              // Preuve de progrès : le même texte avec le vocabulaire d'il y a un mois.
              const then = state.coverageMonthAgo;
              if (!then || then.total === 0) return null;
              const now = Math.round((state.coverage.known / state.coverage.total) * 100);
              const before = Math.round((then.known / then.total) * 100);
              return now - before >= 3 ? (
                <span className="text-known"> Il y a un mois, tu en aurais connu {before} %.</span>
              ) : null;
            })()}
          </p>
        )}
        <p className="text-[15px] text-muted">Lis d’abord sans aide. Touche un mot pour voir son sens et sa forme.</p>
      </header>

      <article className="ru space-y-5 text-[21px] leading-[1.75]">
        {paragraphs.map((p, pi) =>
          p.sentences ? (
            <p key={pi}>
              {p.sentences.map((s, si) => (
                <span key={si}>
                  <Sentence
                    sentence={s}
                    structure={structure}
                    fresh={showNew ? fresh : null}
                    selected={sel && sel.p === pi && sel.s === si ? sel.w : null}
                    onPick={(w) => setSel({ p: pi, s: si, w })}
                  />{" "}
                </span>
              ))}
            </p>
          ) : (
            <p key={pi} className="text-muted">
              {p.text}
            </p>
          ),
        )}
        {waiting && !stuck && <p className="animate-pulse font-sans text-[15px] text-muted">Analyse des phrases en cours…</p>}
        {stuckNotice}
      </article>

      {attribution && <p className="text-[14px] text-faint">{attribution}</p>}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">As-tu compris&nbsp;?</h2>
        {state.questions.length === 0 ? (
          <p className="animate-pulse text-muted">Préparation des questions…</p>
        ) : (
          state.questions.map((q, i) => (
            <Question
              key={q.id}
              n={i + 1}
              q={q}
              answer={state.answers[q.id]}
              onAnswer={async (choice) => {
                let res;
                try {
                  res = await answerQuestionAction(textId, q.id, choice);
                } catch {
                  toast.error("Réponse non enregistrée. Vérifie ta connexion et réponds à nouveau.");
                  throw new Error("non enregistrée");
                }
                setState((s) => ({
                  ...s,
                  answers: { ...s.answers, [q.id]: s.answers[q.id] ?? { choice, correct: res.correct } },
                }));
              }}
            />
          ))
        )}
      </section>

      {(allAnswered || state.questions.length === 0) && !waiting && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={() =>
              start(async () => {
                try {
                  await completeTextAction(textId);
                } catch {
                  toast.error("Lecture non enregistrée. Vérifie ta connexion et réessaie.");
                  return;
                }
                setState((s) => ({ ...s, completed: true }));
                toast.success("Texte lu, c’est enregistré.");
                onFinished?.();
              })
            }
            disabled={pending}
          >
            {state.completed && !onFinished ? <><Check className="size-5" /> Texte lu</> : finishLabel}
          </Button>
          {allAnswered && (
            <span className="text-muted">
              {Object.values(state.answers).filter((a) => a.correct).length} / {state.questions.length} bonnes réponses
            </span>
          )}
        </div>
      )}

      {(state.source === "generated" || state.source === "practice") && !onFinished && !waiting && (
        <AnotherText practice={state.source === "practice"} />
      )}

      {word && sentence && sel && (
        <WordSheet
          key={`${sel.p}-${sel.s}-${sel.w}`}
          word={word}
          sentence={sentence}
          kept={word.entryId !== null && kept.has(word.entryId)}
          onClose={() => setSel(null)}
          onPrev={pos > 0 ? () => setSel(flat[pos - 1]) : undefined}
          onNext={pos >= 0 && pos < flat.length - 1 ? () => setSel(flat[pos + 1]) : undefined}
          onKeep={async () => {
            try {
              await keepWordAction(textId, word.entryId!, sentenceText(sentence));
            } catch {
              toast.error("Mot non enregistré. Réessaie.");
              return;
            }
            setKept((k) => new Set(k).add(word.entryId!));
            toast.success(`${word.lemma} ajouté à tes mots`);
          }}
        />
      )}
    </div>
  );
}

function sentenceText(s: ReaderSentence) {
  return s.tokens.map((t) => t.t).join("");
}

function Sentence({
  sentence,
  structure,
  fresh,
  selected,
  onPick,
}: {
  sentence: ReaderSentence;
  structure: boolean;
  fresh: Set<number> | null;
  selected: number | null;
  onPick: (w: number) => void;
}) {
  const opens = new Map<number, string[]>();
  const closes = new Map<number, number>();
  if (structure)
    for (const c of sentence.clauses) {
      opens.set(c.from, [...(opens.get(c.from) ?? []), CLAUSE_LABEL[c.kind]]);
      closes.set(c.to, (closes.get(c.to) ?? 0) + 1);
    }
  return (
    <>
      {sentence.tokens.map((tok, i) => {
        if (tok.w === undefined) return <span key={i}>{tok.t}</span>;
        const w = sentence.words[tok.w];
        const tint = structure ? tintOf(w) : null;
        return (
          <span key={i}>
            {opens.get(tok.w)?.map((label, k) => (
              <span key={k} className="mr-0.5 align-middle font-sans text-[12px] text-faint">
                [{label}
              </span>
            ))}
            <button
              type="button"
              onClick={() => onPick(tok.w!)}
              className={cn(
                "rounded-[5px] transition-colors hover:bg-sunk",
                selected === tok.w && "bg-cobalt-soft shadow-[0_0_0_2px_var(--cobalt)]",
                tint && TINT_COLOR[tint],
                tint && tint !== "preposition" && "font-medium",
                fresh && w.entryId !== null && fresh.has(w.entryId) && "underline decoration-learning decoration-dotted decoration-2 underline-offset-[5px]",
              )}
            >
              {tok.t}
            </button>
            {closes.has(tok.w) && <span className="ml-0.5 align-middle font-sans text-[12px] text-faint">{"]".repeat(closes.get(tok.w)!)}</span>}
          </span>
        );
      })}
    </>
  );
}

function WordSheet({
  word,
  sentence,
  kept,
  onClose,
  onPrev,
  onNext,
  onKeep,
}: {
  word: ReaderWord;
  sentence: ReaderSentence;
  kept: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onKeep: () => Promise<void>;
}) {
  const [showSentence, setShowSentence] = useState(false);
  const [keeping, startKeep] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div
        role="dialog"
        aria-label={`Mot ${word.raw}`}
        className="mx-auto max-h-[62vh] max-w-xl overflow-y-auto rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_var(--line),0_20px_50px_-12px_rgb(0_0_0/0.35)]"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="ru text-[30px] leading-tight">{word.formAccented ?? word.raw}</p>
            <p className="text-[15px] text-muted">
              {word.lemma && word.lemma !== word.raw ? <span className="ru text-ink">{word.lemma}</span> : null}
              {word.lemma && word.lemma !== word.raw ? " — " : ""}
              {word.type ? `${TYPE_FR[word.type] ?? word.type}` : ""}
              {word.formLabel ? `, ${word.formLabel}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <IconBtn onClick={onPrev} label="Mot précédent"><ChevronLeft className="size-5" /></IconBtn>
            <IconBtn onClick={onNext} label="Mot suivant"><ChevronRight className="size-5" /></IconBtn>
            <IconBtn onClick={onClose} label="Fermer"><X className="size-5" /></IconBtn>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {word.gloss && <p className="text-[20px]">{word.gloss}</p>}
          {word.reason && (
            <p className="text-[16px]">
              <span className={cn("font-medium", tintOf(word) && TINT_COLOR[tintOf(word)!])}>
                {/* Dans la fiche : le cas seul, la raison détaille sa fonction (un nominatif peut être attribut). */}
                {tintOf(word) && tintOf(word) !== "preposition" && tintOf(word) !== "verb" ? CASE_LABELS[tintOf(word)!] : ROLE_LABEL[word.role]}
              </span>
              <span className="text-muted"> — {word.reason}</span>
            </p>
          )}
          {!word.verified && (
            <p className="text-[14px] text-learning">
              {word.entryId === null ? "Mot absent du dictionnaire : analyse proposée par l’IA." : "Forme absente du dictionnaire : analyse proposée par l’IA."}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {word.entryId !== null &&
            (kept ? (
              <span className="flex items-center gap-1 text-known">
                <Check className="size-4" /> Dans tes mots
              </span>
            ) : (
              <Button size="sm" onClick={() => startKeep(onKeep)} disabled={keeping}>
                <Plus className="size-4" /> Apprendre ce mot
              </Button>
            ))}
          {word.entryId !== null && (
            <Link href={`/mots/${word.entryId}`} className="rounded-lg px-3 py-1.5 text-[15px] text-muted hover:bg-sunk hover:text-ink">
              Fiche
            </Link>
          )}
          {sentence.translation && (
            <button type="button" onClick={() => setShowSentence((v) => !v)} className="rounded-lg px-3 py-1.5 text-[15px] text-muted hover:bg-sunk hover:text-ink">
              {showSentence ? "Masquer la traduction" : "Traduire la phrase"}
            </button>
          )}
        </div>
        {showSentence && (
          <div className="mt-3 space-y-1 border-l-2 border-line pl-3">
            {sentence.literal && <p className="text-[15px] text-muted italic">{sentence.literal}</p>}
            <p>{sentence.translation}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function IconBtn({ onClick, label, children }: { onClick?: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunk hover:text-ink disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function Question({
  n,
  q,
  answer,
  onAnswer,
}: {
  n: number;
  q: ComprehensionQuestion;
  answer?: TextAnswer;
  onAnswer: (choice: number) => Promise<void>;
}) {
  const [local, setLocal] = useState<number | null>(null);
  const [fr, setFr] = useState(false);
  const [busy, start] = useTransition();
  const picked = answer?.choice ?? local;
  const done = picked !== null;
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex items-start gap-3">
        <span className="mt-1 text-[15px] text-faint tabular-nums">{n}.</span>
        <div className="min-w-0 flex-1">
          <p className="ru text-[19px]">{q.q}</p>
          {fr && <p className="text-[15px] text-muted">{q.qFr}</p>}
        </div>
        <button type="button" onClick={() => setFr((v) => !v)} className="shrink-0 rounded-md px-2 py-0.5 text-[14px] text-muted hover:bg-sunk">
          {fr ? "RU" : "FR"}
        </button>
      </div>
      <div className="grid gap-2">
        {q.options.map((opt, i) => {
          const right = i === q.answer;
          return (
            <button
              key={i}
              type="button"
              disabled={done || busy}
              onClick={() =>
                start(async () => {
                  setLocal(i);
                  try {
                    await onAnswer(i);
                  } catch {
                    setLocal(null); // pas enregistré : la question reste ouverte
                  }
                })
              }
              className={cn(
                "rounded-xl px-4 py-2.5 text-left transition-colors",
                !done && "bg-paper hover:bg-sunk",
                done && right && "bg-known-soft text-ink shadow-[inset_0_0_0_2px_var(--known)]",
                done && !right && i === picked && "bg-wrong-soft shadow-[inset_0_0_0_2px_var(--wrong)]",
                done && !right && i !== picked && "text-faint",
              )}
            >
              <span className="ru text-[18px]">{opt}</span>
              {fr && q.optionsFr[i] && <span className="block text-[14px] text-muted">{q.optionsFr[i]}</span>}
            </button>
          );
        })}
      </div>
      {done && <p className="text-[15px] text-muted">{q.explain}</p>}
    </div>
  );
}

/** Un nouveau texte du jour, écrit avec le vocabulaire actuel (l'ancien reste dans « Lire »). */
function AnotherText({ practice }: { practice: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="border-t border-line pt-5">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const { id } = await (practice ? newPracticeTextAction() : newDailyTextAction());
              router.push(`/lire/${id}`);
            } catch {
              toast.error("Le nouveau texte n’a pas pu être lancé. Réessaie.");
            }
          })
        }
      >
        {pending ? "Création…" : practice ? "Un autre texte avec mes mots" : "Un autre texte à mon niveau"}
      </Button>
      <p className="mt-2 text-[14px] text-muted">
        {practice ? "Uniquement avec les mots que tu connais" : "Écrit avec tes mots du B1 du moment"}, en une minute environ.
      </p>
    </div>
  );
}
