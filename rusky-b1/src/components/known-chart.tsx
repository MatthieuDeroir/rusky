import type { MonthPoint } from "@/lib/learn";

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
  /** Mois où le seuil serait atteint au rythme moyen ; "atteint" ; null si rythme nul. */
  month: string | "atteint" | null;
}

/** Rythme moyen (mots B1 par mois depuis le premier mois actif, mois en cours au prorata) et mois
 * où chaque seuil de niveau serait atteint. `today` : "YYYY-MM-DD" (Paris). */
export function levelEtas(points: MonthPoint[], levels: { code: string; words: number }[], today: string) {
  const last = points[points.length - 1];
  const firstActive = points.findIndex((p) => p.gained > 0);
  const [y, mo, d] = today.split("-").map(Number);
  const frac = d / new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const elapsed = firstActive < 0 ? 0 : points.length - 1 - firstActive + frac;
  const pace = elapsed > 0 ? last.total / elapsed : 0;
  const etas: LevelEta[] = levels
    .filter((l) => l.words > 0)
    .map((l) => {
      if (last.total >= l.words) return { ...l, month: "atteint" };
      if (pace <= 0) return { ...l, month: null };
      // Mois écoulés depuis aujourd'hui ; la fin du mois en cours correspond à (1 - frac).
      const months = (l.words - last.total) / pace;
      return { ...l, month: addMonths(today.slice(0, 7), Math.max(0, Math.ceil(months - (1 - frac)))) };
    });
  return { pace, etas };
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
  /** Seuils officiels de vocabulaire (A1 780, A2 1 300, B1 2 276). */
  levels: { code: string; words: number }[];
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
  const { pace, etas } = levelEtas(points, levels, today);

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
          {levels
            .filter((l) => l.words > 0)
            .map((l) => (
              <g key={l.code}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(l.words)} y2={y(l.words)} stroke="var(--cobalt)" strokeWidth="1.5" strokeDasharray="3 7" opacity="0.45" />
                <text x={W - PAD.right + 6} y={y(l.words) + 6} fontSize="17" fontWeight="600" fill="var(--cobalt)">
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
        <div className="space-y-1 text-[17px]">
          <p>
            Ton rythme moyen : <span className="font-semibold">{nf(pace)} mots du lexique B1 par mois</span>. À ce rythme :
          </p>
          <ul className="space-y-0.5">
            {etas.map((e) => (
              <li key={e.code}>
                <span className="font-semibold text-cobalt">{e.code}</span> ({nf(e.words)} mots) :{" "}
                {e.month === "atteint" ? "atteint" : e.month ? monthLong(e.month) : "—"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
