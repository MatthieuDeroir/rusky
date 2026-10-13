"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { getDueReviewsAction, rateReviewAction } from "@/app/seance/actions";
import type { ReviewCard, WordCard, QuestionCard } from "@/lib/reader/review";
import type { Rating } from "@/lib/srs";
import { showXpToast } from "@/lib/xp-toast";
import { Button } from "@/components/ui/button";

/** Révision éclair : quelques cartes dues (mots gardés revus dans leur phrase, questions de
 * structure déjà rencontrées). Plafonnée pour tenir en ~5 minutes. */
export function ReviewSession({ limit = 8, onDone }: { limit?: number; onDone?: () => void }) {
  const [cards, setCards] = useState<ReviewCard[] | null>(null);
  const [i, setI] = useState(0);
  const [, start] = useTransition();
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    getDueReviewsAction(limit)
      .then(setCards)
      .catch(() => setCards([]));
  }, [limit]);

  const finished = cards !== null && i >= cards.length;
  useEffect(() => {
    if (finished) onDone?.();
  }, [finished, onDone]);

  if (cards === null) return <p className="text-sm text-foreground/50">Chargement des révisions…</p>;
  if (cards.length === 0)
    return (
      <p className="text-sm text-foreground/60">
        Rien à réviser pour l’instant. Les mots que tu gardes en lisant et les questions de structure reviennent ici,
        au bon moment.
      </p>
    );
  if (finished)
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-300">
        <Check className="size-4" /> Révision terminée ({cards.length} carte{cards.length > 1 ? "s" : ""}).
      </p>
    );

  const card = cards[i];
  const rate = (rating: Rating) => {
    setI((n) => n + 1);
    start(async () => {
      const { xp } = await rateReviewAction(card.key, rating);
      showXpToast(xp);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-foreground/45">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${(i / cards.length) * 100}%` }} />
        </div>
        {i + 1}/{cards.length}
      </div>
      {card.kind === "word" ? (
        <WordReview key={card.key} card={card} onRate={rate} />
      ) : (
        <QuestionReview key={card.key} card={card} onRate={rate} />
      )}
    </div>
  );
}

function highlight(sentence: string, raw: string) {
  const idx = sentence.toLowerCase().indexOf(raw.toLowerCase());
  if (idx < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, idx)}
      <mark className="rounded bg-primary/25 px-0.5 text-foreground">{sentence.slice(idx, idx + raw.length)}</mark>
      {sentence.slice(idx + raw.length)}
    </>
  );
}

function WordReview({ card, onRate }: { card: WordCard; onRate: (r: Rating) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-3 rounded-2xl border border-white/12 bg-white/5 p-4">
      <p className="font-display text-xl leading-relaxed">{highlight(card.sentence, card.raw)}</p>
      <p className="text-sm text-foreground/60">
        Que veut dire « {card.raw} » ici, et sous quelle forme est-il ?
      </p>
      {!shown ? (
        <Button onClick={() => setShown(true)}>Voir la réponse</Button>
      ) : (
        <>
          <div className="space-y-1 border-l-2 border-primary/40 pl-3">
            <p>
              <span className="font-display text-lg">{card.lemma}</span>{" "}
              <span className="text-sm text-foreground/50">· {card.typeLabel}</span>
            </p>
            <p className="text-sm text-foreground/70">{card.formLabel}</p>
            {card.fr && <p className="text-[15px]">{card.fr}</p>}
            <Link href={`/word/${card.entryId}`} className="text-xs text-foreground/45 underline-offset-2 hover:underline">
              Fiche du mot
            </Link>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onRate("again")}>
              À revoir
            </Button>
            <Button onClick={() => onRate("good")}>Je savais</Button>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionReview({ card, onRate }: { card: QuestionCard; onRate: (r: Rating) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const q = card.question;
  const correct = picked === q.answer;
  return (
    <div className="space-y-3 rounded-2xl border border-white/12 bg-white/5 p-4">
      <p className="text-xs text-foreground/40">{card.title}</p>
      <p className="font-display text-lg leading-relaxed">{card.passage}</p>
      <p className="font-medium">{q.q}</p>
      <div className="grid gap-2">
        {q.options.map((opt, i) => {
          const tone =
            picked === null
              ? "border-white/12 bg-white/5 hover:bg-white/10"
              : i === q.answer
                ? "border-emerald-400/50 bg-emerald-400/10"
                : i === picked
                  ? "border-red-400/50 bg-red-400/10"
                  : "border-white/8 text-foreground/50";
          return (
            <button
              key={i}
              type="button"
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className={`rounded-xl border px-3 py-2 text-left text-[15px] ${tone}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          {q.explain && <p className="text-sm text-foreground/75">{q.explain}</p>}
          <Button onClick={() => onRate(correct ? "good" : "again")}>Continuer</Button>
        </>
      )}
    </div>
  );
}
