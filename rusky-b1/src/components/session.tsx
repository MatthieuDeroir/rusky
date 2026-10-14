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
import { answerKey } from "@/lib/keys";

type Step = "review" | "read" | "done";
const STEP_LABEL: Record<Exclude<Step, "done">, string> = {
  review: "Révisions",
  read: "Texte",
};

interface Snapshot {
  knownB1: number;
  b1Total: number;
  level: string;
  streak: number;
}

/** Une leçon : révisions → un texte (95 % de mots connus, les autres sont les mots nouveaux du
 * lexique en cours) → bilan avec les mots nouveaux.
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
  /** Texte de la leçon déjà lu (reprise). */
  read: boolean;
  before: Snapshot;
}

function SessionInner(props: SessionProps) {
  // Figé à l'ouverture : une action serveur (revalidatePath) re-rend la page avec des données
  // recalculées — la leçon en cours ne doit ni perdre ses étapes ni son point de départ.
  const [{ slot, of, reviews, reviewTotal, read, before }] = useState(props);
  // Texte de la leçon : demandé une seule fois à l'ouverture (il s'écrit pendant les révisions).
  const [texts, setTexts] = useState<{ newId: number } | "failed" | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    lessonTextsAction(slot).then(setTexts).catch(() => setTexts("failed"));
  }, [slot]);
  const allSteps: Exclude<Step, "done">[] = ["review", "read"];
  const remaining = allSteps.filter((s) => (s === "review" ? reviews.length > 0 : !read));
  const [step, setStep] = useState<Step>(remaining[0] ?? "done");
  const [after, setAfter] = useState<Snapshot | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, again: 0, learned: 0 });
  const [newWords, setNewWords] = useState<Card[]>([]);
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

  const textId = texts && texts !== "failed" ? texts.newId : null;

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
      {step === "read" &&
        (texts === null ? (
          <p className="animate-pulse text-muted">Préparation du texte…</p>
        ) : texts === "failed" || textId === null ? (
          <div className="space-y-3">
            <p>Le texte n’a pas pu être préparé. Tu peux passer à la suite ; il sera réécrit à ta prochaine ouverture de la leçon.</p>
            <Button onClick={nextStep}>Continuer</Button>
          </div>
        ) : (
          <NewTextStep
            textId={textId}
            onLearned={(ws) => {
              setNewWords(ws);
              setStats((s) => ({ ...s, learned: ws.length }));
            }}
            onDone={nextStep}
          />
        ))}
      {step === "done" && <Recap of={of} before={before} after={after} stats={stats} newWords={newWords} />}
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
    // Raté : il repasse en cours d'apprentissage et revient demain (pas de repassage aujourd'hui).
    setQueue((q) => q.slice(1));
  };

  useEffect(() => {
    // Espace/Entrée : voir le sens, puis « je savais ». Flèches, D/Q, 6/4 du pavé : voir le sens,
    // puis « je savais » (droite/haut/D/6) ou « à revoir » (gauche/bas/Q/4). 1/2 restent valables.
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      const r = answerKey(e);
      if (!shown && (e.key === " " || e.key === "Enter" || r)) {
        e.preventDefault();
        setShown(true);
      } else if (shown && (e.key === "1" || r === "no")) {
        e.preventDefault();
        rate("again");
      } else if (shown && (e.key === "2" || e.key === " " || e.key === "Enter" || r === "yes")) {
        e.preventDefault();
        rate("good");
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  if (!card) return null;
  return (
    <div className="space-y-6">
      <p className="text-[15px] text-muted">
        Encore {queue.length} sur {total}. Retrouve le sens, puis vérifie.
      </p>
      {/* Une carte neuve par mot : sinon le sens du mot suivant s'affiche pendant le fondu de sortie. */}
      <WordFace key={card.entryId} card={card} revealed={shown} />
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
function NewTextStep({ textId, onLearned, onDone }: { textId: number; onLearned: (words: Card[]) => void; onDone: () => void }) {
  const [finishing, setFinishing] = useState(false);
  if (finishing) return <p className="animate-pulse text-muted">Fin de la leçon…</p>;
  return (
    <ReadStep
      textId={textId}
      intro="Presque tous les mots te sont connus ; les autres sont les mots nouveaux de la leçon (bouton « Mots nouveaux » pour les repérer). Touche un mot pour voir son sens."
      finishLabel="Terminer la leçon"
      onDone={() => {
        setFinishing(true);
        textNewWordsAction(textId)
          // Seuls les mots vraiment présents dans le texte (et donc ajoutés) sont listés.
          .then((ws) => onLearned(ws.filter((w) => w.context)))
          .catch(() => {})
          .finally(onDone);
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
  newWords,
}: {
  of: string;
  before: Snapshot;
  after: Snapshot | null;
  stats: { reviewed: number; again: number; learned: number };
  newWords: Card[];
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
            {gained > 0 ? `+${gained} pendant cette leçon.` : "Les mots nouveaux deviendront « connus » après des révisions réussies sur deux jours ; un mot raté repart de zéro."}
            {after.level !== before.level ? ` Niveau estimé : ${before.level} → ${after.level}.` : ""}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="révisés" value={stats.reviewed} />
        <Stat label="à revoir" value={stats.again} />
        <Stat label="mots nouveaux" value={stats.learned} />
      </dl>

      {newWords.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[19px] font-semibold">Les mots nouveaux de la leçon</h2>
          <p className="text-[15px] text-muted">Ils reviendront dans tes révisions.</p>
          <ul className="divide-y divide-line rounded-2xl bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
            {newWords.map((w) => (
              <li key={w.entryId} className="space-y-0.5 px-4 py-2.5">
                <p>
                  <span className="ru text-[19px]">{w.ru}</span> <span className="text-[16px]">{w.gloss}</span>
                </p>
                {w.context && <p className="ru text-[15px] text-muted">{w.context}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
