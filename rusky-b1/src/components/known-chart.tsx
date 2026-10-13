"use client";

import { useState } from "react";
import type { LevelList, MonthPoint } from "@/lib/learn";
import { cn } from "@/lib/utils";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** Largeur fixe du dessin (pas de défilement horizontal) : les mois se resserrent quand des
 * projections en ajoutent, et les libellés s'espacent pour ne pas se chevaucher. */
const W = 600;
const H = 400;
/** Écart minimal (unités du dessin) entre deux libellés de mois. */
const MIN_LABEL_STEP = 62;
const PAD = { top: 30, right: 128, bottom: 62, left: 30 };
const BAR_SHARE = 0.35;
/** Écart minimal entre deux étiquettes de fin de ligne. */
const LABEL_GAP = 20;
/** Au-delà, la projection s'arrête (rythme trop lent pour avoir un sens). */
const MAX_MONTHS = 36;

/** Une couleur franche par lexique, lisible en clair comme en sombre. */
const LEX_COLOR: Record<LevelList, string> = {
  a1: "#d99a00",
  a2: "#e2602a",
  b1: "#c8336f",
  b2: "#7b45e0",
};

type Series = "all" | LevelList;

function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthShort(m: string, withYear: boolean): string {
  const [y, mo] = m.split("-").map(Number);
  return withYear ? `${MONTHS[mo - 1]} ${String(y).slice(2)}` : MONTHS[mo - 1];
}

/** Mots connus par mois. Ligne principale : tous les mots (le vocabulaire, qui donne le niveau),
 * avec les nouveaux mots du mois en barres. Une ligne par lexique conseillé (A1, A2, B1, B2).
 * Paliers jusqu'au prochain niveau en pointillés. Projections à la demande : chaque courbe
 * prolongée au rythme moyen global jusqu'à son objectif (lexique complet, ou prochain niveau). */
export function KnownChart({
  points,
  lexicons,
  next,
  steps,
  today,
}: {
  points: MonthPoint[];
  lexicons: { list: LevelList; code: string; size: number }[];
  /** Prochain niveau officiel (tous les mots). */
  next: { code: string; need: number } | null;
  /** Paliers à tracer (officiels et intermédiaires) jusqu'au prochain niveau officiel. */
  steps: { code: string; need: number }[];
  /** "YYYY-MM-DD" (Paris). */
  today: string;
}) {
  const [shown, setShown] = useState<Set<Series>>(new Set());
  const toggle = (s: Series) =>
    setShown((cur) => {
      const n = new Set(cur);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const n = points.length;
  const last = points[n - 1];

  // Rythme moyen : mots par mois depuis le premier mois actif, mois en cours au prorata.
  const [ty, tm, td] = today.split("-").map(Number);
  const frac = td / new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const firstActive = points.findIndex((p) => p.allGained > 0);
  const elapsed = firstActive < 0 ? 0 : n - 1 - firstActive + frac;
  const series: { key: Series; code: string; color: string; cur: number; target: number }[] = [
    { key: "all", code: "Tous", color: "var(--known)", cur: last.allTotal, target: next?.need ?? last.allTotal },
    ...lexicons.map((l) => ({ key: l.list as Series, code: l.code, color: LEX_COLOR[l.list], cur: last.lex[l.list], target: l.size })),
  ];
  // Projection : valeurs de fin des mois suivants jusqu'à l'objectif, au rythme GLOBAL (tous les
  // mots par mois) pour chaque courbe : l'apprentissage est ciblé sur le lexique en cours, et les
  // lexiques s'emboîtent (A1 ⊂ A2 ⊂ B1 ⊂ B2), donc chaque mot appris compte dans chacun d'eux.
  const pace = elapsed > 0 ? last.allTotal / elapsed : 0;
  const projections = series
    .filter((s) => shown.has(s.key) && s.cur < s.target && pace > 0)
    .map((s) => {
      // À rythme constant, la projection est une droite : elle part d'aujourd'hui (dernier point
      // réel) et s'arrête pile quand l'objectif est atteint (`months` mois plus tard).
      const need = (s.target - s.cur) / pace;
      const reached = need <= MAX_MONTHS;
      const months = Math.min(need, MAX_MONTHS);
      const end = reached ? s.target : s.cur + pace * months;
      return { ...s, months, end, reached, doneMonth: addMonths(last.month, Math.floor(frac + months)) };
    });
  const extra = Math.max(0, ...projections.map((p) => Math.ceil(p.months)));
  const cols = n + extra;

  const plotW = W - PAD.left - PAD.right;
  const step = plotW / Math.max(1, cols - 1);
  // Un libellé de mois sur `every` (toujours le premier et le dernier mois réel).
  const every = Math.max(1, Math.ceil(MIN_LABEL_STEP / step));
  const labelled = (i: number) => i % every === 0 || i === n - 1;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + i * step;
  const yMax = Math.max(next?.need ?? 0, last.allTotal, ...projections.map((p) => p.target)) * 1.06;
  const y = (v: number) => PAD.top + (1 - v / yMax) * plotH;
  const base = y(0);
  const maxGain = Math.max(1, ...points.map((p) => p.allGained));
  const barW = Math.min(44, step * 0.5);
  const anchor = (i: number) => (i === 0 ? "start" : "middle");
  const line = (val: (p: MonthPoint) => number) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val(p)).toFixed(1)}`).join(" ");
  const projEnd = (p: (typeof projections)[number]) => ({ px: x(n - 1) + p.months * step, py: y(p.end) });
  const projPath = (p: (typeof projections)[number]) => {
    const { px, py } = projEnd(p);
    return `M${x(n - 1).toFixed(1)},${y(p.cur).toFixed(1)} L${px.toFixed(1)},${py.toFixed(1)}`;
  };

  // Étiquettes : au bout de la projection si elle est affichée, sinon au bout de la ligne réelle ;
  // écartées pour ne pas se chevaucher.
  const projected = new Map(projections.map((p) => [p.key, p]));
  const ends = series
    .map((s) => {
      const p = projected.get(s.key);
      const label =
        s.key === "all" ? `Tous ${s.cur}` : `${s.code} ${s.cur}/${s.target}`;
      return p
        ? {
            key: s.key,
            color: s.color,
            bold: s.key === "all",
            ex: projEnd(p).px + 10,
            ly: projEnd(p).py,
            text: `${s.code} ${p.reached ? "→" : "≥"} ${monthShort(p.doneMonth, true)}`,
          }
        : { key: s.key, color: s.color, bold: s.key === "all", ex: x(n - 1) + 14, ly: y(s.cur), text: label };
    })
    .map((e) => {
      // Largeur estimée du texte ; une étiquette trop à droite est ramenée dans le dessin.
      const w = e.text.length * (e.bold ? 10 : 9);
      return { ...e, w, ex: Math.min(e.ex, W - w - 2) };
    })
    .sort((a, b) => a.ly - b.ly);
  // Anti-chevauchement : une étiquette qui recouvre (horizontalement et verticalement) une
  // étiquette déjà placée descend sous elle.
  const placed: typeof ends = [];
  for (const e of ends) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const o of placed)
        if (e.ex < o.ex + o.w && o.ex < e.ex + e.w && Math.abs(e.ly - o.ly) < LABEL_GAP) {
          e.ly = o.ly + LABEL_GAP;
          moved = true;
        }
    }
    placed.push(e);
  }

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className="text-muted">Projection à mon rythme :</span>
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={shown.has(s.key)}
            onClick={() => toggle(s.key)}
            disabled={s.cur >= s.target}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 disabled:opacity-40",
              shown.has(s.key) ? "bg-ink text-paper" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink",
            )}
          >
            <i className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.key === "all" ? (next ? `Tous → ${next.code}` : "Tous") : s.code}
          </button>
        ))}
      </div>
      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Mots connus par mois : ${points
            .map((p) => `${monthShort(p.month, false)} ${p.allTotal} (+${p.allGained})`)
            .join(", ")}. Lexiques : ${lexicons.map((l) => `${l.code} ${last.lex[l.list]} sur ${l.size}`).join(", ")}${projections
            .map((p) => `. Projection ${p.code} : ${p.reached ? "atteint en" : "pas atteint avant"} ${monthShort(p.doneMonth, true)}`)
            .join("")}`}
        >
          {/* Nouveaux mots du mois */}
          {points.map((p, i) => {
            if (!p.allGained) return null;
            const h = (p.allGained / maxGain) * plotH * BAR_SHARE;
            const bx = Math.max(x(i) - barW / 2, PAD.left - 10);
            return <rect key={p.month} x={bx} y={base - h} width={barW} height={h} rx="5" fill="var(--known)" opacity="0.16" />;
          })}
          <line x1={PAD.left - 10} x2={x(cols - 1) + 10} y1={base} y2={base} stroke="var(--line)" strokeWidth="2" />
          {/* Paliers jusqu'au prochain niveau : officiels marqués, intermédiaires (− / +) discrets */}
          {steps.map((st) => {
            const minor = /[+−]$/.test(st.code);
            return (
              <g key={st.code}>
                <line
                  x1={PAD.left}
                  x2={x(cols - 1)}
                  y1={y(st.need)}
                  y2={y(st.need)}
                  stroke="var(--cobalt)"
                  strokeWidth={minor ? 1.5 : 2}
                  strokeDasharray={minor ? "2 6" : "4 7"}
                  opacity={minor ? 0.35 : 0.65}
                />
                <text x={PAD.left} y={y(st.need) - 6} fontSize={minor ? 14 : 16} fontWeight="600" fill="var(--cobalt)" opacity={minor ? 0.65 : 1}>
                  {st.code} · {st.need}
                </text>
              </g>
            );
          })}
          {/* Lexiques conseillés */}
          {lexicons.map((l) => (
            <path key={l.list} d={line((p) => p.lex[l.list])} fill="none" stroke={LEX_COLOR[l.list]} strokeWidth="2.5" strokeLinejoin="round" />
          ))}
          {/* Projections */}
          {projections.map((p) => (
            <g key={`p-${p.key}`}>
              <path d={projPath(p)} fill="none" stroke={p.color} strokeWidth={p.key === "all" ? 3.5 : 2.5} strokeDasharray="3 8" strokeLinecap="round" />
              <circle cx={projEnd(p).px} cy={projEnd(p).py} r="4.5" fill={p.color} />
            </g>
          ))}
          {/* Tous les mots : la ligne principale */}
          <path d={line((p) => p.allTotal)} fill="none" stroke="var(--known)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={p.month}>
              <circle cx={x(i)} cy={y(p.allTotal)} r="6" fill="var(--surface)" stroke="var(--known)" strokeWidth="4" />
              {i < n - 1 && p.allTotal > 0 && labelled(i) && (
                <text x={x(i)} y={y(p.allTotal) - 14} textAnchor={anchor(i)} fontSize="18" fontWeight="600" fill="var(--ink)">
                  {p.allTotal}
                </text>
              )}
              {labelled(i) && (
                <>
                  <text x={x(i)} y={base + 26} textAnchor={anchor(i)} fontSize="18" fill="var(--muted)">
                    {monthShort(p.month, i === 0 || p.month.endsWith("-01"))}
                  </text>
                  <text x={x(i)} y={base + 50} textAnchor={anchor(i)} fontSize="17" fontWeight="600" fill="var(--known)">
                    {p.allGained ? `+${p.allGained}` : "–"}
                  </text>
                </>
              )}
            </g>
          ))}
          {/* Mois projetés */}
          {Array.from({ length: extra }, (_, j) => {
            const m = addMonths(last.month, j + 1);
            if (!labelled(n + j) || (n + j) - (n - 1) < every) return null;
            return (
              <text key={m} x={x(n + j)} y={base + 26} textAnchor="middle" fontSize="16" fill="var(--faint)">
                {monthShort(m, m.endsWith("-01"))}
              </text>
            );
          })}
          {/* Étiquettes de fin de ligne */}
          {ends.map((e) => (
            <text key={e.key} x={e.ex} y={e.ly + 6} fontSize={e.bold ? 18 : 16} fontWeight={e.bold ? 700 : 600} fill={e.color}>
              {e.text}
            </text>
          ))}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
        <span className="flex items-center gap-1.5">
          <i className="h-[4px] w-5 rounded-full bg-known" /> tous les mots (niveau)
        </span>
        {lexicons.map((l) => (
          <span key={l.list} className="flex items-center gap-1.5">
            <i className="h-[3px] w-5 rounded-full" style={{ background: LEX_COLOR[l.list] }} /> lexique {l.code}
          </span>
        ))}
        {projections.length > 0 && (
          <span>Pointillés : projection à ton rythme moyen ({Math.round(pace)} mots par mois), l’apprentissage ciblant le lexique en cours.</span>
        )}
      </figcaption>
    </figure>
  );
}
