import type { MonthPoint } from "@/lib/learn";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const fmtLong = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
/** Largeur d'un mois dans le dessin : les libellés (« sept. », « +211 ») ne se chevauchent pas. */
const STEP = 60;
const H = 360;
const PAD = { top: 44, right: 34, bottom: 82, left: 34 };
const BAR_SHARE = 0.4;
/** Au-delà, la projection n'a plus de sens (rythme trop faible). */
const MAX_PROJECTED = 36;

function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthShort(m: string, withYear: boolean): string {
  const [y, mo] = m.split("-").map(Number);
  return withYear ? `${MONTHS[mo - 1]} ${String(y).slice(2)}` : MONTHS[mo - 1];
}

const monthLong = (m: string) => fmtLong.format(new Date(m + "-15T12:00:00Z"));
const nf = (n: number) => Math.round(n).toLocaleString("fr-FR");

export interface Projection {
  /** Mots par mois, en moyenne depuis le premier mois actif (mois en cours au prorata des jours). */
  pace: number;
  /** Mois où tout le lexique serait connu à ce rythme (null : rythme nul ou trop lent). */
  doneMonth: string | null;
  /** Mots connus prévus à l'examen, et le rythme qu'il faudrait pour finir avant. */
  atExam: number | null;
  neededPace: number | null;
  /** Fins de mois projetées (après le mois en cours). */
  points: { month: string; total: number }[];
}

/** Projection linéaire au rythme moyen observé. `today` : "YYYY-MM-DD" (Paris). */
export function project(points: MonthPoint[], target: number, today: string, examDate: string | null): Projection {
  const current = today.slice(0, 7);
  const last = points[points.length - 1];
  const firstActive = points.findIndex((p) => p.gained > 0);
  const [y, mo, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const frac = d / daysInMonth;
  // Mois écoulés depuis le début du premier mois actif : les mois complets + la part du mois en cours.
  const elapsed = firstActive < 0 ? 0 : points.length - 1 - firstActive + frac;
  const pace = elapsed > 0 ? last.total / elapsed : 0;
  const remaining = Math.max(0, target - last.total);
  const out: Projection = { pace, doneMonth: null, atExam: null, neededPace: null, points: [] };
  if (pace <= 0 || remaining === 0) return out;
  // Fin du mois k après le mois en cours : le reste du mois en cours, puis k mois pleins.
  for (let k = 1; k <= MAX_PROJECTED; k++) {
    const total = Math.min(target, last.total + pace * (1 - frac + (k - 1)));
    const month = addMonths(current, k - 1);
    if (k === 1) {
      // Fin du mois en cours : on ne la dessine pas (le point réel est le dernier connu).
      if (total >= target) {
        out.doneMonth = current;
        break;
      }
      continue;
    }
    out.points.push({ month, total });
    if (total >= target) {
      out.doneMonth = month;
      break;
    }
  }
  if (examDate) {
    const [ey, em, ed] = examDate.split("-").map(Number);
    const monthsToExam = (Date.UTC(ey, em - 1, ed) - Date.UTC(y, mo - 1, d)) / (30.44 * 86_400_000);
    if (monthsToExam > 0) {
      out.atExam = Math.min(target, last.total + pace * monthsToExam);
      out.neededPace = remaining / monthsToExam;
    }
  }
  return out;
}

/** Mots du lexique B1 connus : ligne cumulée (réel), barres des nouveaux mots du mois, puis la
 * projection au rythme moyen en pointillés jusqu'au lexique complet, avec le mois de l'examen. */
export function KnownChart({
  points,
  target,
  today,
  examDate,
  levels,
}: {
  points: MonthPoint[];
  target: number;
  today: string;
  examDate: string | null;
  /** Seuils de vocabulaire des niveaux estimés (A1+ 500, A2 1 000…). */
  levels: { code: string; words: number }[];
}) {
  const proj = project(points, target, today, examDate);
  const all = [...points.map((p) => ({ month: p.month, total: p.total })), ...proj.points];
  const n = all.length;
  const W = PAD.left + PAD.right + STEP * Math.max(1, n - 1);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + i * STEP;
  // L'échelle couvre le lexique B1 et, s'il le dépasse, le total de tous les mots connus.
  const yMax = Math.max(target, ...points.map((p) => p.allTotal));
  const y = (v: number) => PAD.top + (1 - v / yMax) * plotH;
  const base = y(0);
  const maxGain = Math.max(1, ...points.map((p) => p.allGained));
  const barW = STEP * 0.5;
  const allBarW = STEP * 0.72;
  const real = points.length;
  const lastReal = real - 1;
  const path = (from: number, to: number) =>
    all
      .slice(from, to + 1)
      .map((p, k) => `${k ? "L" : "M"}${x(from + k).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
  const examMonth = examDate?.slice(0, 7) ?? null;
  const examIdx = examMonth ? all.findIndex((p) => p.month === examMonth) : -1;
  // Libellé de mois : tous, avec l'année en janvier et au premier point.
  const monthLabel = (i: number) => monthShort(all[i].month, i === 0 || all[i].month.endsWith("-01"));
  const anchor = (i: number) => (i === 0 ? "start" : i === n - 1 ? "end" : "middle");

  return (
    <figure className="space-y-3">
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ minWidth: Math.min(W, n * 40) }}
          className="w-full"
          role="img"
          aria-label={`Mots du lexique B1 connus par mois : ${points.map((p) => `${monthShort(p.month, false)} ${p.total} (+${p.gained}), ${p.allTotal} en tout`).join(", ")}${proj.doneMonth ? `. Projection : ${nf(target)} en ${monthLong(proj.doneMonth)}` : ""}`}
        >
          {/* Objectif : tout le lexique */}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} stroke="var(--line)" strokeWidth="2" strokeDasharray="6 6" />
          <text x={PAD.left} y={y(target) - 10} fontSize="18" fill="var(--muted)">
            {nf(target)} mots
          </text>
          {/* Niveaux (seuils de vocabulaire) */}
          {levels.map((l) => {
            // A1 : de 0 au premier seuil, libellé posé au-dessus de l'axe.
            const ly = l.words > 0 ? y(l.words) : base;
            return (
              <g key={l.code}>
                {l.words > 0 && (
                  <line x1={PAD.left} x2={W - PAD.right} y1={ly} y2={ly} stroke="var(--cobalt)" strokeWidth="1.5" strokeDasharray="3 7" opacity="0.45" />
                )}
                <text
                  x={W - PAD.right}
                  y={ly - 7}
                  textAnchor="end"
                  fontSize="17"
                  fontWeight="600"
                  fill="var(--cobalt)"
                  stroke="var(--paper)"
                  strokeWidth="5"
                  paintOrder="stroke"
                >
                  {l.code}
                </text>
              </g>
            );
          })}
          {/* Examen */}
          {examIdx >= 0 && (
            <g>
              <line x1={x(examIdx)} x2={x(examIdx)} y1={y(target) + 8} y2={base} stroke="var(--wrong)" strokeWidth="2" strokeDasharray="4 5" opacity="0.7" />
              <text x={x(examIdx) + 6} y={y(target) + 28} fontSize="18" fill="var(--wrong)">
                examen
              </text>
            </g>
          )}
          {/* Tous les mots connus du mois (en fond, plus large et plus pâle) */}
          {points.map((p, i) => {
            if (!p.allGained) return null;
            const h = (p.allGained / maxGain) * plotH * BAR_SHARE;
            const bx = Math.min(Math.max(x(i) - allBarW / 2, PAD.left - 10), W - PAD.right + 10 - allBarW);
            return <rect key={p.month} x={bx} y={base - h} width={allBarW} height={h} rx="6" fill="var(--known)" opacity="0.09" />;
          })}
          {/* Nouveaux mots B1 du mois (réel) */}
          {points.map((p, i) => {
            if (!p.gained) return null;
            const h = (p.gained / maxGain) * plotH * BAR_SHARE;
            const bx = Math.min(Math.max(x(i) - barW / 2, PAD.left - 10), W - PAD.right + 10 - barW);
            return <rect key={p.month} x={bx} y={base - h} width={barW} height={h} rx="5" fill="var(--known)" opacity="0.22" />;
          })}
          <line x1={PAD.left - 10} x2={W - PAD.right + 10} y1={base} y2={base} stroke="var(--line)" strokeWidth="2" />
          {/* Projection */}
          {proj.points.length > 0 && (
            <path d={path(lastReal, n - 1)} fill="none" stroke="var(--known)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
          )}
          {/* Tous les mots connus (discret) */}
          <path
            d={points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.allTotal).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--known)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            opacity="0.35"
          />
          {/* Réel */}
          <path d={path(0, lastReal)} fill="none" stroke="var(--known)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          {all.map((p, i) => {
            const isReal = i < real;
            const showValue = isReal || i === n - 1 || i === examIdx;
            return (
              <g key={p.month}>
                {isReal ? (
                  <circle cx={x(i)} cy={y(p.total)} r="6" fill="var(--surface)" stroke="var(--known)" strokeWidth="4" />
                ) : (
                  showValue && <circle cx={x(i)} cy={y(p.total)} r="5" fill="var(--known)" opacity="0.6" />
                )}
                {showValue && (
                  <text
                    x={x(i)}
                    y={y(p.total) - 15}
                    textAnchor={anchor(i)}
                    fontSize="20"
                    fontWeight={isReal ? 600 : 400}
                    fill={isReal ? "var(--ink)" : "var(--muted)"}
                  >
                    {isReal ? p.total : `≈ ${nf(p.total)}`}
                  </text>
                )}
                <text x={x(i)} y={base + 26} textAnchor={anchor(i)} fontSize="18" fill={isReal ? "var(--muted)" : "var(--faint)"}>
                  {monthLabel(i)}
                </text>
                {isReal && (
                  <text x={x(i)} y={base + 50} textAnchor={anchor(i)} fontSize="17" fontWeight="600" fill="var(--known)">
                    {points[i].gained ? `+${points[i].gained}` : "–"}
                  </text>
                )}
                {isReal && points[i].allGained > 0 && (
                  <text x={x(i)} y={base + 72} textAnchor={anchor(i)} fontSize="15" fill="var(--faint)">
                    +{points[i].allGained}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded-full bg-known" /> lexique B1 connu
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-[2px] bg-known/25" /> nouveaux mots B1 du mois
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-[2px] w-4 rounded-full bg-known/40" /> tous les mots, B1 et autres (en pâle)
        </span>
        {proj.points.length > 0 && (
          <span className="flex items-center gap-1.5">
            <i className="w-4 border-t-[3px] border-dotted border-known" /> projection
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <i className="w-4 border-t-2 border-dashed border-cobalt/60" /> niveaux (vocabulaire)
        </span>
      </figcaption>
      {proj.pace > 0 && (
        <p className="text-[17px]">
          À ton rythme moyen de <span className="font-semibold">{nf(proj.pace)} mots par mois</span>, les {nf(target)} mots
          seraient connus {proj.doneMonth ? <>en <span className="font-semibold">{monthLong(proj.doneMonth)}</span></> : "dans plus de trois ans"}.
          {proj.atExam !== null && proj.neededPace !== null && examMonth && (
            <>
              {" "}
              À l’examen ({monthLong(examMonth)}), tu en connaîtrais environ {nf(proj.atExam)}
              {proj.atExam < target ? ` ; pour tout connaître d’ici là, il faudrait ${nf(proj.neededPace)} mots par mois.` : "."}
            </>
          )}
        </p>
      )}
    </figure>
  );
}
