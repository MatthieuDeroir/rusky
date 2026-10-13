import type { LevelDef, MonthPoint } from "@/lib/learn";
import { cn } from "@/lib/utils";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const fmtLong = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
/** Largeur d'un mois dans le dessin : les libellés (« sept. », « +211 ») ne se chevauchent pas. */
const STEP = 80;
const H = 360;
const PAD = { top: 30, right: 44, bottom: 82, left: 34 };
const BAR_SHARE = 0.4;

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

export interface LevelEta {
  code: string;
  words: number;
  scope: LevelDef["scope"];
  /** Mois où le seuil serait atteint au rythme moyen ; "atteint" ; null si rythme nul. */
  month: string | "atteint" | null;
}

/** Rythmes moyens (mots par mois depuis le premier mois actif, mois en cours au prorata) — lexique
 * B1 et tous les mots — et mois où chaque palier serait atteint. `today` : "YYYY-MM-DD" (Paris). */
export function levelEtas(points: MonthPoint[], levels: LevelDef[], today: string) {
  const last = points[points.length - 1];
  const firstActive = points.findIndex((p) => p.allGained > 0);
  const [y, mo, d] = today.split("-").map(Number);
  const frac = d / new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const elapsed = firstActive < 0 ? 0 : points.length - 1 - firstActive + frac;
  const pace = elapsed > 0 ? last.total / elapsed : 0;
  const allPace = elapsed > 0 ? last.allTotal / elapsed : 0;
  const etas: LevelEta[] = levels
    .filter((l) => l.words > 0)
    .map((l) => {
      const have = l.scope === "b1" ? last.total : last.allTotal;
      const rate = l.scope === "b1" ? pace : allPace;
      if (have >= l.words) return { ...l, month: "atteint" };
      if (rate <= 0) return { ...l, month: null };
      // Mois à partir d'aujourd'hui ; la fin du mois en cours correspond à (1 - frac).
      const months = (l.words - have) / rate;
      return { ...l, month: addMonths(today.slice(0, 7), Math.max(0, Math.ceil(months - (1 - frac)))) };
    });
  return { pace, allPace, etas };
}

/** Mots connus par mois : le lexique B1 (ligne et barres vertes, « +n ») et, en pâle, tous les mots
 * (B1 et hors lexique, chiffre gris) ; seuils des niveaux en pointillés. */
export function KnownChart({
  points,
  target,
  today,
  levels,
}: {
  points: MonthPoint[];
  target: number;
  today: string;
  /** Paliers de vocabulaire (A1 780 … C2 20 000). */
  levels: LevelDef[];
}) {
  const n = points.length;
  const W = PAD.left + PAD.right + STEP * Math.max(1, n - 1);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + i * STEP;
  // L'échelle couvre le lexique B1 entier (le niveau B1 en haut) et, au besoin, tous les mots.
  const yMax = Math.max(target, ...points.map((p) => p.allTotal));
  const y = (v: number) => PAD.top + (1 - v / yMax) * plotH;
  const base = y(0);
  const maxGain = Math.max(1, ...points.map((p) => p.allGained));
  const barW = STEP * 0.42;
  const allBarW = STEP * 0.62;
  const anchor = (i: number) => (i === 0 ? "start" : i === n - 1 ? "end" : "middle");
  const line = (val: (p: MonthPoint) => number) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val(p)).toFixed(1)}`).join(" ");
  const bar = (i: number, v: number, w: number) => {
    const h = (v / maxGain) * plotH * BAR_SHARE;
    const bx = Math.min(Math.max(x(i) - w / 2, PAD.left - 10), W - PAD.right + 10 - w);
    return { x: bx, y: base - h, width: w, height: h };
  };
  const { pace, allPace, etas } = levelEtas(points, levels, today);
  // Seuils dessinés : ceux qui tiennent dans l'échelle (au-delà de B1, quand tous les mots y arrivent).
  const drawn = levels.filter((l) => l.words > 0 && l.words <= yMax);

  return (
    <figure className="space-y-3">
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ minWidth: Math.min(W, n * 56) }}
          className="w-full"
          role="img"
          aria-label={`Mots connus par mois : ${points
            .map((p) => `${monthShort(p.month, false)} ${p.total} du lexique B1 (+${p.gained}), ${p.allTotal} en tout (+${p.allGained})`)
            .join(", ")}`}
        >
          {/* Niveaux : seuils officiels de vocabulaire */}
          {drawn.map((l) => (
              <g key={l.code}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(l.words)}
                  y2={y(l.words)}
                  stroke="var(--cobalt)"
                  strokeWidth="1.5"
                  strokeDasharray="3 7"
                  opacity={l.code.endsWith("+") ? 0.25 : 0.5}
                />
                <text
                  x={W - PAD.right + 6}
                  y={y(l.words) + 6}
                  fontSize={l.code.endsWith("+") ? 14 : 17}
                  fontWeight="600"
                  fill="var(--cobalt)"
                  opacity={l.code.endsWith("+") ? 0.7 : 1}
                >
                  {l.code}
                </text>
              </g>
            ))}
          {/* Barres : tous les mots (fond pâle), puis le lexique B1 */}
          {points.map((p, i) => p.allGained > 0 && <rect key={`a${p.month}`} {...bar(i, p.allGained, allBarW)} rx="6" fill="var(--known)" opacity="0.1" />)}
          {points.map((p, i) => p.gained > 0 && <rect key={`b${p.month}`} {...bar(i, p.gained, barW)} rx="5" fill="var(--known)" opacity="0.24" />)}
          <line x1={PAD.left - 10} x2={W - PAD.right + 10} y1={base} y2={base} stroke="var(--line)" strokeWidth="2" />
          {/* Lignes : tous les mots (pâle), puis le lexique B1 */}
          <path d={line((p) => p.allTotal)} fill="none" stroke="var(--known)" strokeWidth="2.5" strokeLinejoin="round" opacity="0.35" />
          <path d={line((p) => p.total)} fill="none" stroke="var(--known)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={p.month}>
              <circle cx={x(i)} cy={y(p.total)} r="6" fill="var(--surface)" stroke="var(--known)" strokeWidth="4" />
              <text x={x(i)} y={y(p.total) + 28} textAnchor={anchor(i)} fontSize="20" fontWeight="600" fill="var(--ink)">
                {p.total}
              </text>
              {p.allTotal > p.total && (
                <text x={x(i)} y={y(p.allTotal) - 12} textAnchor={anchor(i)} fontSize="16" fill="var(--faint)">
                  {p.allTotal}
                </text>
              )}
              <text x={x(i)} y={base + 26} textAnchor={anchor(i)} fontSize="18" fill="var(--muted)">
                {monthShort(p.month, i === 0 || p.month.endsWith("-01"))}
              </text>
              <text x={x(i)} y={base + 50} textAnchor={anchor(i)} fontSize="17" fontWeight="600" fill="var(--known)">
                {p.gained ? `+${p.gained}` : "–"}
              </text>
              {p.allGained > 0 && (
                <text x={x(i)} y={base + 72} textAnchor={anchor(i)} fontSize="15" fill="var(--faint)">
                  +{p.allGained}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded-full bg-known" /> lexique B1 (vert, chiffre noir)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-[2px] w-4 rounded-full bg-known/40" /> tous les mots (pâle, chiffre gris)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-4 border-t-2 border-dashed border-cobalt/60" /> seuils des niveaux
        </span>
      </figcaption>
      {pace > 0 && (
        <div className="space-y-2 text-[17px]">
          <p>
            Ton rythme moyen : <span className="font-semibold">{nf(pace)} mots du lexique B1 par mois</span> ({nf(allPace)} en
            tout). À ce rythme :
          </p>
          <ul className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-0.5">
            {etas.map((e) => {
              const plus = e.code.endsWith("+");
              return (
                <li key={e.code} className={cn("col-span-3 grid grid-cols-subgrid", plus && "text-[15px] text-muted")}>
                  <span className="font-semibold text-cobalt">{e.code}</span>
                  <span className="text-right tabular-nums text-muted">{nf(e.words)}</span>
                  <span>{e.month === "atteint" ? "atteint" : e.month ? monthLong(e.month) : "—"}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-[14px] text-faint">
            Jusqu’à B1, les mots du lexique B1 ; au-delà, tous les mots connus. Les niveaux « + » sont des étapes
            intermédiaires.
          </p>
        </div>
      )}
    </figure>
  );
}
