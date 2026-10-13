import type { MonthPoint } from "@/lib/learn";

const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const W = 640;
const H = 300;
const PAD = { top: 34, right: 28, bottom: 62, left: 28 };
/** Les barres (mots du mois) occupent au plus cette part de la hauteur : la ligne reste lisible. */
const BAR_SHARE = 0.45;

/** Courbe cumulée des mots du lexique B1 connus (ligne, total au-dessus de chaque point) et mots
 * devenus connus dans le mois (barres, « +n » sous le mois). */
export function KnownChart({ points }: { points: MonthPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.total));
  const maxGain = Math.max(1, ...points.map((p) => p.gained));
  const n = points.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;
  const base = y(0);
  const barW = Math.min(44, (plotW / Math.max(1, n - 1)) * 0.45);
  const anchor = (i: number) => (i === 0 ? "start" : i === n - 1 ? "end" : "middle");
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  const label = points.map((p) => `${fmtMonth.format(new Date(p.month + "-15T12:00:00Z"))} : ${p.total} (+${p.gained})`).join(", ");
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Mots du lexique B1 connus par mois — ${label}`}>
        {points.map((p, i) => {
          if (!p.gained) return null;
          const h = (p.gained / maxGain) * plotH * BAR_SHARE;
          // Les barres des extrémités restent dans le cadre (la ligne commence et finit au bord).
          const bx = Math.min(Math.max(x(i) - barW / 2, PAD.left - 8), W - PAD.right + 8 - barW);
          return <rect key={p.month} x={bx} y={base - h} width={barW} height={h} rx="5" fill="var(--known)" opacity="0.22" />;
        })}
        <line x1={PAD.left - 8} x2={W - PAD.right + 8} y1={base} y2={base} stroke="var(--line)" strokeWidth="2" />
        <path d={line} fill="none" stroke="var(--known)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.month}>
            <circle cx={x(i)} cy={y(p.total)} r="6" fill="var(--surface)" stroke="var(--known)" strokeWidth="4" />
            <text x={x(i)} y={y(p.total) - 16} textAnchor={anchor(i)} fontSize="22" fontWeight="600" fill="var(--ink)">
              {p.total}
            </text>
            <text x={x(i)} y={base + 26} textAnchor={anchor(i)} fontSize="20" fill="var(--muted)">
              {fmtMonth.format(new Date(p.month + "-15T12:00:00Z"))}
            </text>
            <text x={x(i)} y={base + 52} textAnchor={anchor(i)} fontSize="19" fontWeight="600" fill="var(--known)">
              {p.gained ? `+${p.gained}` : "–"}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded-full bg-known" /> total connu
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-[2px] bg-known/25" /> nouveaux mots du mois
        </span>
      </figcaption>
    </figure>
  );
}
