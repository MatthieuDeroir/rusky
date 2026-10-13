"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CloudOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { invalidateAction, markKnownAction } from "@/app/actions";
import { Button, wordMeta } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface TriageCard {
  id: number;
  ru: string;
  type: string;
  gender: string | null;
  aspect: string | null;
  gloss: string;
  exampleRu: string | null;
  exampleFr: string | null;
}

const RETRY_MS = [1500, 4000, 10000];
/** Distance (px) à partir de laquelle un glissé compte comme une réponse. */
const SWIPE = 90;

/** Mots passés (« je ne connais pas ») : gardés sur cet appareil pour ne pas les reproposer à la
 * prochaine visite. Ils restent à apprendre : les leçons les enseigneront. */
function skippedKey(list: string) {
  return `rusky-tri-passes-${list}`;
}
function readSkipped(list: string): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(skippedKey(list)) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}
function writeSkipped(list: string, ids: Set<number>) {
  try {
    localStorage.setItem(skippedKey(list), JSON.stringify([...ids]));
  } catch {}
}

/** Tri rapide d'un lexique : le mot et son sens ; → ou glisser à droite = je connais, ← ou glisser
 * à gauche = je ne connais pas. Les mots connus sont enregistrés par lots, avec nouvelles
 * tentatives en cas d'échec réseau. */
export function TriageDeck(props: { list: string; label: string; left: number; cards: TriageCard[] }) {
  // Figé à l'ouverture : un nouveau rendu du serveur ne doit pas raccourcir le paquet en cours.
  const [{ list, label, left, cards }] = useState(props);
  const router = useRouter();
  const [skipped, setSkipped] = useState<Set<number> | null>(null);
  const [i, setI] = useState(0);
  const [stats, setStats] = useState({ known: 0, unknown: 0 });
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  // Enregistrement des mots connus : file envoyée par lots.
  const queue = useRef<number[]>([]);
  const running = useRef(false);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pending, setPending] = useState(0);
  const flush = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSave("saving");
    while (queue.current.length) {
      const batch = queue.current.slice(0, 50);
      let ok = false;
      for (let a = 0; a <= RETRY_MS.length && !ok; a++) {
        try {
          await markKnownAction(batch);
          ok = true;
        } catch {
          if (a < RETRY_MS.length) await new Promise((r) => setTimeout(r, RETRY_MS[a]));
        }
      }
      if (!ok) {
        running.current = false;
        setSave("error");
        return;
      }
      queue.current.splice(0, batch.length);
      setPending(queue.current.length);
    }
    running.current = false;
    setSave("saved");
  }, []);

  useEffect(() => {
    // Lu après le montage (le serveur n'a pas accès au stockage de l'appareil).
    const frame = requestAnimationFrame(() => setSkipped(readSkipped(list)));
    const onLeave = (e: BeforeUnloadEvent) => {
      if (queue.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [list]);

  // Paquet de la visite : sans les mots passés lors des visites précédentes (l'état `skipped` est
  // lu une fois ; les mots passés pendant la visite ne sont écrits que sur l'appareil).
  const deck = useMemo(() => (skipped ? cards.filter((c) => !skipped.has(c.id)) : []), [cards, skipped]);
  const card = deck[i];
  // Position et mots passés tenus dans des références : deux appuis rapprochés (avant le rendu
  // suivant) traitent bien deux cartes différentes, jamais deux fois la même.
  const pos = useRef(0);
  const passed = useRef<Set<number> | null>(null);
  const sent = useRef(new Set<number>());

  const answer = useCallback(
    (known: boolean) => {
      if (!skipped) return;
      const c = deck[pos.current];
      if (!c) return;
      pos.current += 1;
      if (known) {
        if (!sent.current.has(c.id)) {
          sent.current.add(c.id);
          queue.current.push(c.id);
          setPending(queue.current.length);
          void flush();
        }
      } else {
        passed.current ??= new Set(skipped);
        passed.current.add(c.id);
        writeSkipped(list, passed.current);
      }
      setStats((s) => (known ? { ...s, known: s.known + 1 } : { ...s, unknown: s.unknown + 1 }));
      setDrag(0);
      setI(pos.current);
    },
    [deck, skipped, list, flush],
  );

  useEffect(() => {
    // Flèches, et 4 / 6 du pavé numérique, verrou numérique allumé (« 4 », « 6 ») ou éteint
    // (« ArrowLeft », « Left », parfois sans nom selon le système) : on lit le nom de la touche,
    // sa position (code) et son ancien code numérique (37/39 flèches, 100/102 pavé).
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.keyCode;
      const right =
        ["ArrowRight", "Right", "6"].includes(e.key) || e.code === "Numpad6" || k === 39 || k === 102;
      const left = ["ArrowLeft", "Left", "4"].includes(e.key) || e.code === "Numpad4" || k === 37 || k === 100;
      if (!right && !left) return;
      e.preventDefault();
      e.stopPropagation();
      answer(right);
    };
    // Phase de capture : la touche est traitée avant tout autre élément de la page.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [answer]);

  const remaining = Math.max(0, left - stats.known - (skipped?.size ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/mots"
          prefetch={false}
          onClick={async (e) => {
            // Vide le cache de navigation : la page Mots affiche les comptes à jour.
            e.preventDefault();
            await invalidateAction().catch(() => {});
            router.push("/mots");
          }}
          className="text-[15px] text-muted hover:text-ink"
        >
          ← Mots
        </Link>
        <SaveBadge state={save} pending={pending} retry={() => void flush()} />
      </div>
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold">Trier le {label}</h1>
        <p className="text-muted">
          Tu le connais ? Flèche droite (ou 6 du pavé numérique), ou glisse à droite. Sinon, flèche gauche (ou 4), ou glisse à gauche : il reste à
          apprendre, tes leçons s’en chargeront.
        </p>
      </header>

      {skipped === null ? (
        <p className="animate-pulse text-muted">Chargement…</p>
      ) : !card ? (
        <div className="space-y-4 py-6">
          <p className="text-[20px] font-medium">
            {deck.length === 0 && stats.known + stats.unknown === 0 ? "Plus aucun mot à trier ici." : "Paquet terminé."}
          </p>
          <p className="text-muted">
            {stats.known} connu{stats.known > 1 ? "s" : ""}, {stats.unknown} à apprendre.
            {left > cards.length ? " Reviens sur la page pour la suite." : ""}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => location.reload()}>Continuer</Button>
            {(skipped.size > 0 || stats.unknown > 0) && (
              <Button
                variant="secondary"
                onClick={() => {
                  writeSkipped(list, new Set());
                  location.reload();
                }}
              >
                Revoir les mots passés
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="text-[15px] text-muted tabular-nums">
            {stats.known} connu{stats.known > 1 ? "s" : ""} · {stats.unknown} à apprendre · encore {remaining} dans ce lexique
          </p>
          <div
            className="touch-pan-y select-none"
            onPointerDown={(e) => {
              start.current = e.clientX;
              setDragging(true);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (start.current !== null) setDrag(e.clientX - start.current);
            }}
            onPointerUp={() => {
              const d = drag;
              start.current = null;
              setDragging(false);
              if (d > SWIPE) answer(true);
              else if (d < -SWIPE) answer(false);
              else setDrag(0);
            }}
            onPointerCancel={() => {
              start.current = null;
              setDragging(false);
              setDrag(0);
            }}
          >
            <div
              key={card.id}
              className={cn(
                "rounded-3xl bg-surface px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--line)]",
                !dragging && "transition-transform",
                drag > SWIPE / 2 && "shadow-[inset_0_0_0_2px_var(--known)]",
                drag < -SWIPE / 2 && "shadow-[inset_0_0_0_2px_var(--learning)]",
              )}
              style={{ transform: `translateX(${drag}px) rotate(${drag / 30}deg)` }}
            >
              <p className="ru text-[44px] leading-tight sm:text-[52px]">{card.ru}</p>
              <p className="mt-1 text-[15px] text-faint">{wordMeta(card)}</p>
              <p className="mt-6 text-[24px] font-medium">{card.gloss}</p>
              {card.exampleRu && (
                <div className="mx-auto mt-3 max-w-md space-y-1">
                  <p className="ru text-[19px]">{card.exampleRu}</p>
                  {card.exampleFr && <p className="text-[15px] text-muted">{card.exampleFr}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="secondary" onClick={() => answer(false)}>
              <ArrowLeft className="size-5" /> Je ne connais pas
            </Button>
            <Button size="lg" variant="known" onClick={() => answer(true)}>
              Je connais <ArrowRight className="size-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SaveBadge({ state, pending, retry }: { state: string; pending: number; retry: () => void }) {
  if (state === "idle") return null;
  if (state === "error")
    return (
      <button type="button" onClick={retry} className="flex items-center gap-1.5 rounded-full bg-wrong-soft px-3 py-1 text-[14px] text-wrong">
        <CloudOff className="size-4" /> {pending} non enregistré{pending > 1 ? "s" : ""}, réessayer
      </button>
    );
  return (
    <span className={cn("flex items-center gap-1.5 text-[14px]", state === "saved" ? "text-known" : "text-muted")} role="status" aria-live="polite">
      {state === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      {state === "saving" ? "Enregistrement…" : "Enregistré"}
    </span>
  );
}
