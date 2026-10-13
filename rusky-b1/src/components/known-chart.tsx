import type { MonthPoint } from "@/lib/learn";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** Largeur d'un mois dans le dessin : les libellés (« sept. », « +211 ») ne se chevauchent pas. */
const STEP = 80;
const H = 360;
const PAD = { top: 30, right: 44, bottom: 82, left: 34 };
const BAR_SHARE = 0.4;

function monthShort(m: string, withYear: boolean): string {
  const [y, mo] = m.split("-").map(Number);
  return withYear ? `${MONTHS[mo - 1]} ${String(y).slice(2)}` : MONTHS[mo - 1];
}


/** Mots connus par mois : le lexique B1 (ligne et barres vertes, « +n ») et, en pâle, tous les mots
 * (B1 et hors lexique, chiffre gris). */
export function KnownChart({
  points,
  next,
}: {
  points: MonthPoint[];
  /** Prochain palier officiel : sa ligne (mots connus de sa liste) et son seuil. */
  next: { code: string; need: number; listLabel: string } | null;
}) {
  const n = points.length;
  const W = PAD.left + PAD.right + STEP * Math.max(1, n - 1);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + i * STEP;
  // L'échelle s'arrête au prochain palier (ou à tous les mots s'ils le dépassent) : les barres
  // restent lisibles.
  const yMax = Math.max(next?.need ?? 0, ...points.map((p) => p.allTotal)) * 1.05;
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
          {/* Barres : tous les mots (fond pâle), puis le lexique B1 */}
          {points.map((p, i) => p.allGained > 0 && <rect key={`a${p.month}`} {...bar(i, p.allGained, allBarW)} rx="6" fill="var(--known)" opacity="0.1" />)}
          {points.map((p, i) => p.gained > 0 && <rect key={`b${p.month}`} {...bar(i, p.gained, barW)} rx="5" fill="var(--known)" opacity="0.24" />)}
          <line x1={PAD.left - 10} x2={W - PAD.right + 10} y1={base} y2={base} stroke="var(--line)" strokeWidth="2" />
          {/* Prochain palier : seuil (pointillés) et mots connus de sa liste (bleu) */}
          {next && (
            <g>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(next.need)} y2={y(next.need)} stroke="var(--cobalt)" strokeWidth="2" strokeDasharray="4 7" opacity="0.6" />
              <text x={W - PAD.right + 6} y={y(next.need) + 6} fontSize="18" fontWeight="600" fill="var(--cobalt)">
                {next.code}
              </text>
              <path d={line((p) => p.levelTotal)} fill="none" stroke="var(--cobalt)" strokeWidth="3" strokeLinejoin="round" opacity="0.8" />
              <text x={x(n - 1)} y={y(points[n - 1].levelTotal) - 12} textAnchor="end" fontSize="17" fontWeight="600" fill="var(--cobalt)">
                {points[n - 1].levelTotal}
              </text>
            </g>
          )}
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
        {next && (
          <span className="flex items-center gap-1.5">
            <i className="h-[3px] w-4 rounded-full bg-cobalt/80" /> {next.code} : {next.listLabel}, seuil {next.need} en pointillés
          </span>
        )}
      </figcaption>
    </figure>
  );
}
