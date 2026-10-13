"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, Plus } from "lucide-react";
import {
  completeUnitAction,
  ensureUnitAction,
  moreUnitTextAction,
  type TextRef,
  type UnitSession,
} from "@/app/seance/actions";
import type { ReadingUnit } from "@/lib/reader/curriculum";
import { showXpToast } from "@/lib/xp-toast";
import { ReviewSession } from "./review-session";
import { Button } from "@/components/ui/button";

/** Séance du week-end (≈ 60-90 min, reprend où on en était) : réchauffement → nouvelle structure →
 * lecture guidée → lecture libre → bilan. */
export function UnitView({ unit }: { unit: ReadingUnit }) {
  const router = useRouter();
  const [session, setSession] = useState<UnitSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    ensureUnitAction(unit.id)
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [unit.id]);

  // Tant qu'un texte s'écrit ou s'analyse, on rafraîchit l'état (ensureUnit est idempotent).
  const busy = session && [session.lesson, ...session.texts].some((t) => t && t.status !== "READY" && t.status !== "FAILED");
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => ensureUnitAction(unit.id).then(setSession).catch(() => {}), 4000);
    return () => clearInterval(id);
  }, [busy, unit.id]);

  const from = `?from=/seance/${unit.id}`;

  return (
    <div className="space-y-5">
      <Step n={1} title="Réchauffement" hint="10 min · ce que tu as déjà vu">
        <ReviewSession limit={10} />
      </Step>

      <Step n={2} title="Nouvelle structure" hint="10-15 min">
        <p className="text-[15px] leading-relaxed text-foreground/85">{unit.idea}</p>
        <ul className="space-y-1.5 text-[15px]">
          {unit.points.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary">›</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {unit.table && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-foreground/45">
                  {unit.table.head.map((h, i) => (
                    <th key={i} className="pb-1 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unit.table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-white/8">
                    {r.map((c, j) => (
                      <td key={j} className={`py-1.5 pr-3 ${j === 0 ? "text-foreground/55" : "font-display text-base"}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-200/90">Piège : {unit.pitfall}</p>
        {session?.lesson ? (
          <TextLink t={session.lesson} href={`/lire/${session.lesson.id}${from}`} label="Décortiquer les phrases-clés" />
        ) : (
          <p className="text-sm text-foreground/50">Préparation des phrases-clés…</p>
        )}
      </Step>

      <Step n={3} title="Lecture guidée" hint="30-45 min · textes écrits pour cette unité">
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!session && !error && <p className="text-sm text-foreground/50">Préparation des textes…</p>}
        <div className="space-y-2">
          {session?.texts.map((t) => <TextLink key={t.id} t={t} href={`/lire/${t.id}${from}`} />)}
        </div>
        {session && session.texts.length > 0 && session.texts.every((t) => t.completed) && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await moreUnitTextAction(unit.id);
                setSession(await ensureUnitAction(unit.id));
              })
            }
          >
            <Plus className="size-4" /> Un texte de plus
          </Button>
        )}
      </Step>

      <Step n={4} title="Lecture libre" hint="optionnel">
        <p className="text-sm text-foreground/65">
          Un conte du corpus ou un texte à toi (article, sous-titres…) : colle-le dans la bibliothèque.
        </p>
        <Link href="/lire" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Bibliothèque <ArrowRight className="size-4" />
        </Link>
      </Step>

      <Step n={5} title="Bilan" hint="">
        {session && (
          <>
            <p className="text-[15px]">
              {session.score.answered > 0
                ? `Questions de structure : ${session.score.right}/${session.score.answered} justes du premier coup (${Math.round(
                    (session.score.right / session.score.answered) * 100,
                  )} %).`
                : "Réponds aux questions de structure dans les textes pour voir ton score."}
            </p>
            {session.score.answered > 0 && session.score.right / session.score.answered < 0.6 && (
              <p className="text-sm text-amber-200/80">
                Moins de 60 % : relis la fiche et fais un texte de plus avant de valider — ou valide quand même, les
                questions ratées reviendront en révision.
              </p>
            )}
            {session.completed ? (
              <p className="flex items-center gap-2 text-emerald-300">
                <Check className="size-4" /> Unité validée.
              </p>
            ) : (
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const { xp, next } = await completeUnitAction(unit.id);
                    showXpToast(xp);
                    setSession((s) => (s ? { ...s, completed: true } : s));
                    router.push(next ? `/seance/${next}` : "/seance");
                  })
                }
              >
                Valider l’unité et passer à la suivante
              </Button>
            )}
          </>
        )}
      </Step>
    </div>
  );
}

function TextLink({ t, href, label }: { t: TextRef; href: string; label?: string }) {
  const state = t.completed
    ? "✓ Lu"
    : t.status === "GENERATING"
      ? "En cours d’écriture…"
      : t.status === "FAILED"
        ? "Échec — ouvre-le pour réessayer"
        : t.status === "READY"
          ? "Prêt"
          : "Analyse en cours… tu peux commencer";
  return (
    <Link href={href} className="glass glass-lift flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-display text-lg">{label ?? t.title}</p>
        <p className="text-xs text-foreground/50">{state}</p>
      </div>
      {t.completed ? <Check className="size-5 text-emerald-300" /> : <ArrowRight className="size-5 text-foreground/40" />}
    </Link>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="glass-strong space-y-3 rounded-3xl p-5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {n}
        </span>
        <h2 className="font-display text-xl">{title}</h2>
        {hint && <span className="text-xs text-foreground/40">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
