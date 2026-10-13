"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  completeLessonAction,
  invalidateAction,
  lessonReviewsDoneAction,
  lessonTextsAction,
  progressSnapshotAction,
  textNewWordsAction,
  textStateAction,
  type TextState,
} from "@/app/actions";
import { SaverProvider, SaveStatus, useSaver } from "@/components/saver";
import type { Card } from "@/lib/learn";
import type { SlotId } from "@/lib/lessons";
import type { Rating } from "@/lib/srs";
import { Reader } from "@/components/reader";
import { Button, LinkButton, wordMeta } from "@/components/ui";
import { cn } from "@/lib/utils";

type Step = "review" | "known" | "new" | "done";
const STEP_LABEL: Record<Exclude<Step, "done">, string> = {
  review: "Révisions",
  known: "Texte connu",
  new: "10 mots nouveaux",
};

interface Snapshot {
  knownB1: number;
  b1Total: number;
  level: string;
  streak: number;
}

/** Une leçon : révisions → texte avec les mots connus → texte avec 10 mots nouveaux → bilan.
 * Chaque réponse est enregistrée tout de suite : on peut quitter à tout moment sans rien perdre. */
export function Session(props: SessionProps) {
  return (
    <SaverProvider>
      <SessionInner {...props} />
    </SaverProvider>
  );
}

interface SessionProps {
  slot: SlotId;
  /** « du matin », « de l’après-midi »… */
  of: string;
  /** Révisions restantes (toutes, sauf reprise après un rechargement). */
  reviews: Card[];
  reviewTotal: number;
  knownRead: boolean;
  newRead: boolean;
  before: Snapshot;
}

function SessionInner(props: SessionProps) {
  // Figé à l'ouverture : une action serveur (revalidatePath) re-rend la page avec des données
  // recalculées — la leçon en cours ne doit ni perdre ses étapes ni son point de départ.
  const [{ slot, of, reviews, reviewTotal, knownRead, newRead, before }] = useState(props);
  // Textes de la leçon : demandés une seule fois à l'ouverture (ils s'écrivent pendant les révisions).
  const [texts, setTexts] = useState<{ knownId: number; newId: number } | "failed" | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    lessonTextsAction(slot).then(setTexts).catch(() => setTexts("failed"));
  }, [slot]);
  const allSteps: Exclude<Step, "done">[] = ["review", "known", "new"];
  const remaining = allSteps.filter((s) => (s === "review" ? reviews.length > 0 : s === "known" ? !knownRead : !newRead));
  const [step, setStep] = useState<Step>(remaining[0] ?? "done");
  const [after, setAfter] = useState<Snapshot | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, again: 0, learned: 0 });
  const nextStep = useCallback(() => {
    if (step === "review") void lessonReviewsDoneAction(slot).catch(() => {});
    const i = remaining.indexOf(step as Exclude<Step, "done">);
    setStep(i >= 0 && i < remaining.length - 1 ? remaining[i + 1] : "done");
    // `remaining` est figé (calculé depuis l'état initial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, slot]);

  useEffect(() => {
    if (step === "done")
      completeLessonAction(slot)
        .catch(() => {})
        .then(() => progressSnapshotAction())
        .then(setAfter)
        .catch(() => {});
  }, [step, slot]);

  const textId = texts && texts !== "failed" ? (step === "known" ? texts.knownId : texts.newId) : null;

  return (
    <div className="min-h-[80vh]">
      <div className="mb-6 flex items-center gap-3">
        <QuitButton />
        <ol className="flex flex-1 gap-1.5" aria-label="Étapes de la leçon">
          {allSteps.map((s, idx) => {
            const cur = step === "done" ? allSteps.length : allSteps.indexOf(step);
            return (
              <li key={s} className="flex-1">
                <div className={cn("h-1.5 rounded-full", idx < cur ? "bg-known" : idx === cur ? "bg-cobalt" : "bg-line")} />
                <span className={cn("mt-1 block text-[13px]", idx === cur ? "text-ink" : "text-faint")}>{STEP_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="-mt-3 mb-5 flex min-h-6 flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-muted">Leçon {of}. Chaque réponse est enregistrée : tu peux t’arrêter à tout moment.</p>
        <SaveStatus />
      </div>

      {step === "review" && (
        <ReviewDeck
          cards={reviews}
          total={reviewTotal}
          onAnswered={(r) => setStats((s) => ({ ...s, reviewed: s.reviewed + (r === "again" ? 0 : 1), again: s.again + (r === "again" ? 1 : 0) }))}
          onDone={nextStep}
        />
      )}
      {(step === "known" || step === "new") &&
        (texts === null ? (
          <p className="animate-pulse text-muted">Préparation du texte…</p>
        ) : texts === "failed" || textId === null ? (
          <div className="space-y-3">
            <p>Le texte n’a pas pu être préparé. Tu peux passer à la suite ; il sera réécrit à ta prochaine ouverture de la leçon.</p>
            <Button onClick={nextStep}>Continuer</Button>
          </div>
        ) : step === "known" ? (
          <ReadStep
            key="known"
            textId={textId}
            intro="Un texte écrit uniquement avec les mots que tu connais : lis-le d’une traite."
            finishLabel="Texte suivant"
            onDone={nextStep}
          />
        ) : (
          <NewTextStep key="new" textId={textId} onLearned={(n) => setStats((s) => ({ ...s, learned: n }))} onDone={nextStep} />
        ))}
      {step === "done" && <Recap of={of} before={before} after={after} stats={stats} />}
    </div>
  );
}

// ---- Révisions -------------------------------------------------------------------------------

function ReviewDeck({
  cards,
  total,
  onAnswered,
  onDone,
}: {
  cards: Card[];
  total: number;
  onAnswered: (r: Rating) => void;
  onDone: () => void;
}) {
  const [queue, setQueue] = useState(cards);
  const [shown, setShown] = useState(false);
  const save = useSaver();
  const card = queue[0];

  useEffect(() => {
    if (!card) onDone();
  }, [card, onDone]);

  const rate = (r: Rating) => {
    save({ entryId: card.entryId, answer: r });
    onAnswered(r);
    setShown(false);
    // Raté : il revient en fin de pile pour être revu avant la fin de la séance.
    setQueue((q) => (r === "again" ? [...q.slice(1), q[0]] : q.slice(1)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && e.key === "1") rate("again");
      else if (shown && (e.key === "2" || e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        rate("good");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) return null;
  return (
    <div className="space-y-6">
      <p className="text-[15px] text-muted">
        Encore {queue.length} sur {total}. Retrouve le sens, puis vérifie.
      </p>
      <WordFace card={card} revealed={shown} />
      {!shown ? (
        <Button size="lg" className="w-full" onClick={() => setShown(true)}>
          Voir le sens
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="wrong" onClick={() => rate("again")}>
            À revoir
          </Button>
          <Button size="lg" variant="known" onClick={() => rate("good")}>
            Je savais
          </Button>
        </div>
      )}
    </div>
  );
}

/** Le mot, puis son sens et une phrase. Le russe d'abord, en grand : c'est la lecture qu'on entraîne. */
function WordFace({ card, revealed }: { card: Card; revealed: boolean }) {
  const sentence = card.context || card.exampleRu;
  return (
    <div className="rounded-3xl bg-surface px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--line)]">
      <p className="ru text-[44px] leading-tight sm:text-[52px]">{card.ru}</p>
      <p className="mt-1 text-[15px] text-faint">{wordMeta(card)}</p>
      <div className={cn("mt-6 space-y-3 transition-opacity", revealed ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!revealed}>
        <p className="text-[24px] font-medium">{card.gloss}</p>
        {sentence && (
          <div className="mx-auto max-w-md space-y-1">
            <p className="ru text-[19px]">{sentence}</p>
            {!card.context && card.exampleFr && <p className="text-[15px] text-muted">{card.exampleFr}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Lecture -----------------------------------------------------------------------------------

function ReadStep({
  textId,
  intro,
  finishLabel,
  onDone,
}: {
  textId: number;
  intro: string;
  finishLabel: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<TextState | null>(null);
  useEffect(() => {
    textStateAction(textId).then(setState).catch(() => {});
  }, [textId]);
  if (!state) return <p className="animate-pulse text-muted">Chargement du texte…</p>;
  return (
    <div className="space-y-6">
      <p className="text-[15px] text-muted">{intro}</p>
      <Reader textId={textId} initial={state} collected={[]} onFinished={onDone} finishLabel={finishLabel} />
      <button type="button" onClick={onDone} className="text-[15px] text-muted underline-offset-4 hover:text-ink hover:underline">
        Passer ce texte
      </button>
    </div>
  );
}

/** Texte avec 10 mots nouveaux, puis la liste de ces mots (avec la phrase où ils apparaissent). */
function NewTextStep({ textId, onLearned, onDone }: { textId: number; onLearned: (n: number) => void; onDone: () => void }) {
  const [words, setWords] = useState<Card[] | null>(null);
  const [phase, setPhase] = useState<"read" | "words">("read");
  if (phase === "words")
    return words === null ? (
      <p className="animate-pulse text-muted">Les mots nouveaux…</p>
    ) : (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-[24px] font-semibold">{words.length} mots nouveaux</h2>
          <p className="text-[15px] text-muted">Ils entrent dans tes révisions des prochaines leçons.</p>
        </div>
        <ul className="divide-y divide-line rounded-2xl bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
          {words.map((w) => (
            <li key={w.entryId} className="space-y-1 px-4 py-3">
              <p>
                <span className="ru text-[21px]">{w.ru}</span>{" "}
                <span className="text-[14px] text-faint">{wordMeta(w)}</span>
              </p>
              <p className="text-[17px]">{w.gloss}</p>
              {w.context && <p className="ru text-[16px] text-muted">{w.context}</p>}
            </li>
          ))}
        </ul>
        <Button size="lg" className="w-full sm:w-auto" onClick={onDone}>
          Terminer la leçon
        </Button>
      </div>
    );
  return (
    <ReadStep
      textId={textId}
      intro="Ce texte introduit 10 mots nouveaux (bouton « Mots nouveaux » pour les repérer). Touche un mot pour voir son sens."
      finishLabel="Voir les mots nouveaux"
      onDone={() => {
        setPhase("words");
        textNewWordsAction(textId)
          .then((ws) => {
            // Seuls les mots vraiment présents dans le texte (et donc ajoutés) sont listés.
            const learned = ws.filter((w) => w.context);
            setWords(learned);
            onLearned(learned.length);
          })
          .catch(() => setWords([]));
      }}
    />
  );
}

// ---- Bilan -------------------------------------------------------------------------------------

function Recap({
  of,
  before,
  after,
  stats,
}: {
  of: string;
  before: Snapshot;
  after: Snapshot | null;
  stats: { reviewed: number; again: number; learned: number };
}) {
  const gained = after ? after.knownB1 - before.knownB1 : 0;
  return (
    <div className="space-y-8 py-4">
      <div className="space-y-2">
        <p className="text-muted">Leçon {of} terminée.</p>
        <h1 className="text-[34px] leading-tight font-semibold">
          {after ? (
            <>
              <span className="tabular-nums">{after.knownB1}</span> mots du B1 connus
            </>
          ) : (
            "…"
          )}
        </h1>
        {after && (
          <p className="text-[19px] text-muted">
            {gained > 0 ? `+${gained} pendant cette leçon.` : "Les mots nouveaux deviendront « connus » après des révisions réussies sur deux jours."}
            {after.level !== before.level ? ` Niveau estimé : ${before.level} → ${after.level}.` : ""}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="révisés" value={stats.reviewed} />
        <Stat label="à revoir" value={stats.again} />
        <Stat label="mots nouveaux" value={stats.learned} />
      </dl>

      {after && after.streak > 0 && (
        <p className="text-[17px]">
          {after.streak} jour{after.streak > 1 ? "s" : ""} d’affilée.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <LinkButton href="/" size="lg">
          Retour à l’accueil
        </LinkButton>
        <LinkButton href="/progres" size="lg" variant="secondary">
          Voir mes progrès
        </LinkButton>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
      <dd className="text-[28px] font-semibold tabular-nums">{value}</dd>
      <dt className="text-[14px] text-muted">{label}</dt>
    </div>
  );
}

/** Quitter la leçon : on vide le cache de navigation pour que l'accueil affiche le bon décompte. */
function QuitButton() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      type="button"
      aria-label="Quitter la leçon"
      disabled={leaving}
      onClick={async () => {
        setLeaving(true);
        await invalidateAction().catch(() => {});
        router.push("/");
      }}
      className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunk hover:text-ink disabled:opacity-50"
    >
      <X className="size-5" />
    </button>
  );
}
