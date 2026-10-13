"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, Check, Plus, Languages, Shapes, Type, RotateCw } from "lucide-react";
import {
  answerQuestionAction,
  completeTextAction,
  getTextStateAction,
  keepWordAction,
  retryAnalysisAction,
} from "@/app/lire/actions";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";
import { WORD_TYPE_LABELS } from "@/lib/grammar";
import {
  CLAUSE_LABEL,
  ROLE_LABEL,
  type ReaderAnalysis,
  type ReaderAnswer,
  type ReaderQuestion,
  type ReaderSentence,
  type ReaderWord,
  type ReadingStatus,
} from "@/lib/reader/types";
import { LEGEND_ROLES, ROLE_CHIP, ROLE_TEXT, ROLE_UNDERLINE } from "./roles";

interface Props {
  textId: number;
  title: string;
  backHref?: string;
  backLabel?: string;
  attribution?: string | null;
  initialStatus: ReadingStatus;
  initialAnalysis: ReaderAnalysis | null;
  initialError: string | null;
  initialAnswers: Record<string, ReaderAnswer>;
  initialCompleted: boolean;
  collectedEntryIds: number[];
}

interface Toggles {
  structure: boolean;
  translation: boolean;
  accents: boolean;
}

const TOGGLES_KEY = "reader-toggles";
const POLL_MS = 2500;

interface Selection {
  p: number;
  s: number;
  w: number;
}

function sentenceText(s: ReaderSentence) {
  return s.tokens.map((t) => t.t).join("");
}

export function Reader(props: Props) {
  const { textId } = props;
  const [title, setTitle] = useState(props.title);
  const [status, setStatus] = useState(props.initialStatus);
  const [analysis, setAnalysis] = useState(props.initialAnalysis);
  const [error, setError] = useState(props.initialError);
  const [toggles, setToggles] = useState<Toggles>({ structure: false, translation: false, accents: false });
  const [sel, setSel] = useState<Selection | null>(null);
  const [answers, setAnswers] = useState(props.initialAnswers);
  const [collected, setCollected] = useState(() => new Set(props.collectedEntryIds));
  const [completed, setCompleted] = useState(props.initialCompleted);
  const [pending, startTransition] = useTransition();

  // Préférences d'affichage par lecteur (confort uniquement : sans stockage, tout reste off).
  // Lues après le montage pour que le rendu serveur et la première hydratation coïncident.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOGGLES_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchro depuis localStorage (système externe)
      if (saved) setToggles((t) => ({ ...t, ...JSON.parse(saved) }));
    } catch {}
  }, []);
  const toggle = (k: keyof Toggles) =>
    setToggles((t) => {
      const next = { ...t, [k]: !t[k] };
      try {
        localStorage.setItem(TOGGLES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  // Sondage pendant l'analyse : les paragraphes arrivent un par un.
  const generating = status === "GENERATING";
  const analyzing = generating || status === "PENDING" || status === "ANALYZING";
  useEffect(() => {
    if (!analyzing) return;
    const id = setInterval(async () => {
      try {
        const st = await getTextStateAction(textId);
        setTitle(st.title);
        setStatus(st.status);
        setAnalysis(st.analysis);
        setError(st.error);
      } catch {}
    }, POLL_MS);
    return () => clearInterval(id);
  }, [analyzing, textId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const paragraphs = useMemo(() => analysis?.paragraphs ?? [], [analysis]);
  const done = paragraphs.filter((p) => p.sentences).length;
  const partial = paragraphs.some((p) => p.failed);
  const questions = useMemo(() => paragraphs.flatMap((p) => p.questions), [paragraphs]);
  const answered = questions.filter((q) => answers[q.id]);
  const right = answered.filter((q) => answers[q.id].correct).length;

  const selected = sel ? paragraphs[sel.p]?.sentences?.[sel.s] : null;
  const selWord = selected && sel ? selected.words[sel.w] : null;

  const retry = () =>
    startTransition(async () => {
      await retryAnalysisAction(textId);
      setStatus("ANALYZING");
    });

  const finish = () =>
    startTransition(async () => {
      const { xp } = await completeTextAction(textId);
      setCompleted(true);
      showXpToast(xp);
      if (!xp) toast("Texte déjà terminé — relecture enregistrée.");
    });

  const block = toggles.structure || toggles.translation;

  return (
    <div className={`space-y-5 ${sel ? "pb-72" : ""}`}>
      <div className="space-y-3">
        <Link href={props.backHref ?? "/lire"} className="text-sm text-foreground/50 hover:text-foreground/80">
          ← {props.backLabel ?? "Bibliothèque"}
        </Link>
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
        <div className="flex flex-wrap gap-2">
          <ToggleChip on={toggles.structure} onClick={() => toggle("structure")} icon={<Shapes className="size-4" />}>
            Structure
          </ToggleChip>
          <ToggleChip on={toggles.translation} onClick={() => toggle("translation")} icon={<Languages className="size-4" />}>
            Traduction
          </ToggleChip>
          <ToggleChip on={toggles.accents} onClick={() => toggle("accents")} icon={<Type className="size-4" />}>
            Accents
          </ToggleChip>
        </div>
        {toggles.structure && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {LEGEND_ROLES.map((r) => (
              <span key={r} className={`font-medium ${ROLE_TEXT[r]}`}>
                ● {ROLE_LABEL[r]}
              </span>
            ))}
            <span className="text-foreground/50">⟨ ⟩ subordonnée</span>
          </div>
        )}
        {generating && (
          <p className="animate-pulse text-sm text-foreground/60">
            Écriture du texte à ton niveau… (environ 20 secondes, puis l’analyse commence)
          </p>
        )}
        {analyzing && !generating && (
          <p className="text-sm text-foreground/60">
            Analyse en cours… {done}/{paragraphs.length || "?"} paragraphe{paragraphs.length > 1 ? "s" : ""} — tu peux
            commencer à lire.
          </p>
        )}
        {status === "FAILED" && (
          <div className="flex items-center gap-3 text-sm text-red-300">
            Analyse impossible{error ? ` : ${error}` : ""}.
            <Button size="sm" variant="outline" onClick={retry} disabled={pending}>
              <RotateCw className="size-4" /> Réessayer
            </Button>
          </div>
        )}
        {status === "READY" && partial && (
          <div className="flex items-center gap-3 text-sm text-amber-300/90">
            Analyse partielle : certains paragraphes n’ont que les infos du dictionnaire.
            <Button size="sm" variant="outline" onClick={retry} disabled={pending}>
              <RotateCw className="size-4" /> Relancer
            </Button>
          </div>
        )}
      </div>

      <article className="glass-strong space-y-6 rounded-3xl p-5 sm:p-7">
        {paragraphs.map((para, pi) => (
          <section key={pi} className="space-y-4">
            {!para.sentences ? (
              <p className="font-display text-xl leading-relaxed text-foreground/40">{para.text}</p>
            ) : block ? (
              <div className="space-y-4">
                {para.sentences.map((s, si) => (
                  <div key={si} className="space-y-1.5">
                    <SentenceLine
                      sentence={s}
                      structure={toggles.structure}
                      accents={toggles.accents}
                      selected={sel?.p === pi && sel.s === si ? sel.w : null}
                      onPick={(w) => setSel({ p: pi, s: si, w })}
                    />
                    {toggles.structure && s.skeleton && (
                      <p className="text-xs text-foreground/55">
                        <span className="text-foreground/35">squelette · </span>
                        {s.skeleton}
                      </p>
                    )}
                    {toggles.translation && (s.literal || s.translation) && (
                      <div className="space-y-0.5 border-l-2 border-white/10 pl-3 text-sm">
                        {s.literal && <p className="italic text-foreground/50">{s.literal}</p>}
                        {s.translation && <p className="text-foreground/80">{s.translation}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="leading-relaxed">
                {para.sentences.map((s, si) => (
                  <span key={si}>
                    <SentenceLine
                      inline
                      sentence={s}
                      structure={false}
                      accents={toggles.accents}
                      selected={sel?.p === pi && sel.s === si ? sel.w : null}
                      onPick={(w) => setSel({ p: pi, s: si, w })}
                    />{" "}
                  </span>
                ))}
              </p>
            )}
            {para.questions.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                answer={answers[q.id]}
                onAnswer={async (choice) => {
                  const res = await answerQuestionAction(textId, q.id, choice);
                  setAnswers((a) => (a[q.id] ? a : { ...a, [q.id]: { choice, correct: res.correct } }));
                  showXpToast(res.xp);
                }}
              />
            ))}
          </section>
        ))}
      </article>

      {props.attribution && <p className="text-xs text-foreground/40">{props.attribution}</p>}

      {!analyzing && paragraphs.length > 0 && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <p className="text-sm text-foreground/70">
            {questions.length > 0
              ? `Questions de structure : ${right}/${questions.length} juste${right > 1 ? "s" : ""} du premier coup`
              : "Pas de question sur ce texte."}
          </p>
          <Button onClick={finish} disabled={pending || completed}>
            {completed ? (
              <>
                <Check className="size-4" /> Texte terminé
              </>
            ) : (
              "J’ai fini ce texte"
            )}
          </Button>
        </div>
      )}

      {selWord && selected && sel && (
        <WordSheet
          // Remonté à chaque mot : la traduction de phrase se referme (on la redemande consciemment).
          key={`${sel.p}-${sel.s}-${sel.w}`}
          word={selWord}
          sentence={selected}
          accents={toggles.accents}
          collected={selWord.entryId !== null && collected.has(selWord.entryId)}
          onClose={() => setSel(null)}
          onPrev={sel.w > 0 ? () => setSel({ ...sel, w: sel.w - 1 }) : undefined}
          onNext={sel.w < selected.words.length - 1 ? () => setSel({ ...sel, w: sel.w + 1 }) : undefined}
          onKeep={async () => {
            if (selWord.entryId === null) return;
            const res = await keepWordAction({
              textId,
              entryId: selWord.entryId,
              formKey: selWord.formKey,
              raw: selWord.raw,
              sentence: sentenceText(selected),
            });
            setCollected((c) => new Set(c).add(selWord.entryId!));
            toast.success(`« ${selWord.lemma} » ajouté à tes mots`);
            showXpToast(res.xp);
          }}
        />
      )}
    </div>
  );
}

function ToggleChip({
  on,
  onClick,
  icon,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
        on ? "bg-primary/15 text-primary ring-primary/40" : "bg-white/5 text-foreground/65 ring-white/10 hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function SentenceLine({
  sentence,
  structure,
  accents,
  selected,
  onPick,
  inline,
}: {
  sentence: ReaderSentence;
  structure: boolean;
  accents: boolean;
  selected: number | null;
  onPick: (w: number) => void;
  inline?: boolean;
}) {
  const opens = new Map<number, string[]>();
  const closes = new Map<number, number>();
  if (structure) {
    for (const c of sentence.clauses) {
      opens.set(c.from, [...(opens.get(c.from) ?? []), CLAUSE_LABEL[c.kind]]);
      closes.set(c.to, (closes.get(c.to) ?? 0) + 1);
    }
  }
  const Tag = inline ? "span" : "p";
  return (
    <Tag className={`font-display text-xl ${inline ? "" : "leading-loose"}`}>
      {sentence.tokens.map((tok, i) => {
        if (tok.w === undefined) return <span key={i}>{tok.t}</span>;
        const w = sentence.words[tok.w];
        const shown = accents && w.formAccented && strip(w.formAccented) === strip(tok.t) ? matchCase(w.formAccented, tok.t) : tok.t;
        const isSel = selected === tok.w;
        return (
          <span key={i}>
            {opens.get(tok.w)?.map((label, k) => (
              <span key={k} className="mr-0.5 align-middle font-sans text-[11px] font-semibold text-foreground/45">
                ⟨{label}
              </span>
            ))}
            <button
              type="button"
              onClick={() => onPick(tok.w!)}
              className={`rounded-md px-0.5 transition-colors hover:bg-white/10 ${isSel ? "bg-primary/20 ring-1 ring-primary/50" : ""} ${
                structure ? `${ROLE_TEXT[w.role]} underline decoration-2 underline-offset-[6px] ${ROLE_UNDERLINE[w.role]}` : ""
              }`}
            >
              {shown}
            </button>
            {closes.has(tok.w) && (
              <span className="ml-0.5 align-middle font-sans text-[11px] font-semibold text-foreground/45">
                {"⟩".repeat(closes.get(tok.w)!)}
              </span>
            )}
          </span>
        );
      })}
    </Tag>
  );
}

const strip = (s: string) => s.normalize("NFD").replace(/́/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");

/** Garde la majuscule initiale du texte d'origine sur la forme accentuée du dictionnaire. */
function matchCase(accented: string, original: string) {
  return original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()
    ? accented[0].toUpperCase() + accented.slice(1)
    : accented;
}

function WordSheet({
  word,
  sentence,
  accents,
  collected,
  onClose,
  onPrev,
  onNext,
  onKeep,
}: {
  word: ReaderWord;
  sentence: ReaderSentence;
  accents: boolean;
  collected: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onKeep: () => Promise<void>;
}) {
  const [showSentence, setShowSentence] = useState(false);
  const [keeping, startKeep] = useTransition();
  const shown = accents && word.formAccented ? word.formAccented : word.raw;

  const keep = useCallback(() => startKeep(onKeep), [onKeep]);

  // Portail vers <body> : un ancêtre à backdrop-filter capturerait sinon le position: fixed.
  return createPortal(
    <div className="fixed inset-x-0 bottom-16 z-50 px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-4">
      <div className="mx-auto max-h-[60vh] max-w-xl overflow-y-auto rounded-3xl border border-white/15 bg-[oklch(0.2_0.015_70)] p-5 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-2xl">{shown}</span>
              {word.lemma !== word.raw && <span className="text-foreground/50">← {word.lemma}</span>}
            </div>
            <p className="text-sm text-foreground/60">
              {word.type ? `${WORD_TYPE_LABELS[word.type]} · ` : ""}
              {word.formLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NavBtn onClick={onPrev} label="Mot précédent">‹</NavBtn>
            <NavBtn onClick={onNext} label="Mot suivant">›</NavBtn>
            <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-full p-1.5 text-foreground/50 hover:bg-white/10">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${ROLE_CHIP[word.role]}`}>
              {ROLE_LABEL[word.role]}
            </span>
            {word.gloss && <span className="text-lg">« {word.gloss} »</span>}
          </div>
          {word.reason && <p className="text-[15px] text-foreground/85">{word.reason}</p>}
          {word.dictFr && <p className="text-sm text-foreground/50">Dictionnaire : {word.dictFr}</p>}
          {!word.verified && (
            <p className="text-xs text-amber-300/80">
              {word.entryId === null
                ? "Mot absent du dictionnaire — analyse proposée par l’IA, à prendre avec prudence."
                : "Forme absente du dictionnaire — analyse proposée par l’IA."}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {word.entryId !== null &&
            (collected ? (
              <span className="flex items-center gap-1 text-sm text-emerald-300">
                <Check className="size-4" /> Dans tes mots
              </span>
            ) : (
              <Button size="sm" onClick={keep} disabled={keeping}>
                <Plus className="size-4" /> Garder ce mot
              </Button>
            ))}
          {word.entryId !== null && (
            <Button size="sm" variant="outline" render={<Link href={`/word/${word.entryId}`} />} nativeButton={false}>
              Fiche
            </Button>
          )}
          {sentence.translation && (
            <Button size="sm" variant="ghost" onClick={() => setShowSentence((v) => !v)}>
              {showSentence ? "Masquer la phrase" : "Traduire la phrase"}
            </Button>
          )}
        </div>
        {showSentence && (
          <div className="mt-3 space-y-1 border-l-2 border-white/10 pl-3 text-sm">
            {sentence.skeleton && <p className="text-foreground/60">{sentence.skeleton}</p>}
            {sentence.literal && <p className="italic text-foreground/50">{sentence.literal}</p>}
            <p className="text-foreground/85">{sentence.translation}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NavBtn({ onClick, label, children }: { onClick?: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      className="grid size-8 place-items-center rounded-full text-xl text-foreground/60 hover:bg-white/10 disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function QuestionCard({
  q,
  answer,
  onAnswer,
}: {
  q: ReaderQuestion;
  answer?: ReaderAnswer;
  onAnswer: (choice: number) => Promise<void>;
}) {
  const [local, setLocal] = useState<number | null>(null);
  const [busy, startBusy] = useTransition();
  const picked = answer?.choice ?? local;
  const revealed = picked !== null;

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Question de structure</p>
      <p className="mt-1 font-medium">{q.q}</p>
      <div className="mt-3 grid gap-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          const tone = !revealed
            ? "border-white/12 bg-white/5 hover:bg-white/10"
            : isAnswer
              ? "border-emerald-400/50 bg-emerald-400/10"
              : isPicked
                ? "border-red-400/50 bg-red-400/10"
                : "border-white/8 bg-white/[0.03] text-foreground/50";
          return (
            <button
              key={i}
              type="button"
              disabled={revealed || busy}
              onClick={() =>
                startBusy(async () => {
                  setLocal(i);
                  await onAnswer(i);
                })
              }
              className={`rounded-xl border px-3 py-2 text-left text-[15px] transition-colors ${tone}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {revealed && q.explain && <p className="mt-3 text-sm text-foreground/75">{q.explain}</p>}
    </div>
  );
}
