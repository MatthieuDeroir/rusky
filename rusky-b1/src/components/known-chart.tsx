import type { LevelList, MonthPoint } from "@/lib/learn";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** Largeur d'un mois dans le dessin : les libellés (« sept. », « +211 ») ne se chevauchent pas. */
const STEP = 80;
const H = 380;
const PAD = { top: 30, right: 112, bottom: 62, left: 34 };
const BAR_SHARE = 0.35;
/** Écart minimal entre deux étiquettes de fin de ligne. */
const LABEL_GAP = 20;

/** Une couleur franche par lexique, lisible en clair comme en sombre. */
const LEX_COLOR: Record<LevelList, string> = {
  a1: "#d99a00",
  a2: "#e2602a",
  b1: "#c8336f",
  b2: "#7b45e0",
};

function monthShort(m: string, withYear: boolean): string {
  const [y, mo] = m.split("-").map(Number);
  return withYear ? `${MONTHS[mo - 1]} ${String(y).slice(2)}` : MONTHS[mo - 1];
}

/** Mots connus par mois. Ligne principale : tous les mots (le vocabulaire, qui donne le niveau),
 * avec les nouveaux mots du mois en barres. Une ligne par lexique conseillé (A1, A2, B1, B2) :
 * où j'en suis de chacun. Seuil du prochain niveau en pointillés. */
export function KnownChart({
  points,
  lexicons,
  next,
  steps,
}: {
  points: MonthPoint[];
  lexicons: { list: LevelList; code: string; size: number }[];
  /** Prochain niveau officiel (tous les mots). */
  next: { code: string; need: number } | null;
  /** Paliers à tracer (officiels et intermédiaires) jusqu'au prochain niveau officiel. */
  steps: { code: string; need: number }[];
}) {
  const n = points.length;
  const W = PAD.left + PAD.right + STEP * Math.max(1, n - 1);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + i * STEP;
  const last = points[n - 1];
  const yMax = Math.max(next?.need ?? 0, last.allTotal) * 1.06;
  const y = (v: number) => PAD.top + (1 - v / yMax) * plotH;
  const base = y(0);
  const maxGain = Math.max(1, ...points.map((p) => p.allGained));
  const barW = STEP * 0.5;
  const anchor = (i: number) => (i === 0 ? "start" : "middle");
  const line = (val: (p: MonthPoint) => number) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val(p)).toFixed(1)}`).join(" ");

  // Étiquettes de fin de ligne, écartées pour ne pas se chevaucher (du haut vers le bas).
  const ends = [
    { key: "all", text: `Tous ${last.allTotal}`, color: "var(--known)", v: last.allTotal, bold: true },
    ...lexicons.map((l) => ({
      key: l.list,
      text: `${l.code} ${last.lex[l.list]}/${l.size}`,
      color: LEX_COLOR[l.list],
      v: last.lex[l.list],
      bold: false,
    })),
  ]
    .map((e) => ({ ...e, ly: y(e.v) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) ends[i].ly = Math.max(ends[i].ly, ends[i - 1].ly + LABEL_GAP);

  return (
    <figure className="space-y-3">
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ minWidth: Math.min(W, n * 64 + 110) }}
          className="w-full"
          role="img"
          aria-label={`Mots connus par mois : ${points
            .map((p) => `${monthShort(p.month, false)} ${p.allTotal} (+${p.allGained})`)
            .join(", ")}. Lexiques : ${lexicons.map((l) => `${l.code} ${last.lex[l.list]} sur ${l.size}`).join(", ")}`}
        >
          {/* Nouveaux mots du mois */}
          {points.map((p, i) => {
            if (!p.allGained) return null;
            const h = (p.allGained / maxGain) * plotH * BAR_SHARE;
            const bx = Math.max(x(i) - barW / 2, PAD.left - 10);
            return <rect key={p.month} x={bx} y={base - h} width={barW} height={h} rx="5" fill="var(--known)" opacity="0.16" />;
          })}
          <line x1={PAD.left - 10} x2={x(n - 1) + 10} y1={base} y2={base} stroke="var(--line)" strokeWidth="2" />
          {/* Paliers jusqu'au prochain niveau : officiels marqués, intermédiaires (− / +) discrets */}
          {steps.map((st) => {
            const minor = /[+−]$/.test(st.code);
            return (
              <g key={st.code}>
                <line
                  x1={PAD.left}
                  x2={x(n - 1)}
                  y1={y(st.need)}
                  y2={y(st.need)}
                  stroke="var(--cobalt)"
                  strokeWidth={minor ? 1.5 : 2}
                  strokeDasharray={minor ? "2 6" : "4 7"}
                  opacity={minor ? 0.35 : 0.65}
                />
                <text
                  x={PAD.left}
                  y={y(st.need) - 6}
                  fontSize={minor ? 14 : 16}
                  fontWeight="600"
                  fill="var(--cobalt)"
                  opacity={minor ? 0.65 : 1}
                >
                  {st.code} · {st.need}
                </text>
              </g>
            );
          })}
          {/* Lexiques conseillés */}
          {lexicons.map((l) => (
            <path key={l.list} d={line((p) => p.lex[l.list])} fill="none" stroke={LEX_COLOR[l.list]} strokeWidth="2.5" strokeLinejoin="round" />
          ))}
          {/* Tous les mots : la ligne principale */}
          <path d={line((p) => p.allTotal)} fill="none" stroke="var(--known)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={p.month}>
              <circle cx={x(i)} cy={y(p.allTotal)} r="6" fill="var(--surface)" stroke="var(--known)" strokeWidth="4" />
              {i < n - 1 && p.allTotal > 0 && (
                <text x={x(i)} y={y(p.allTotal) - 14} textAnchor={anchor(i)} fontSize="18" fontWeight="600" fill="var(--ink)">
                  {p.allTotal}
                </text>
              )}
              <text x={x(i)} y={base + 26} textAnchor={anchor(i)} fontSize="18" fill="var(--muted)">
                {monthShort(p.month, i === 0 || p.month.endsWith("-01"))}
              </text>
              <text x={x(i)} y={base + 50} textAnchor={anchor(i)} fontSize="17" fontWeight="600" fill="var(--known)">
                {p.allGained ? `+${p.allGained}` : "–"}
              </text>
            </g>
          ))}
          {/* Étiquettes de fin de ligne */}
          {ends.map((e) => (
            <text key={e.key} x={x(n - 1) + 14} y={e.ly + 6} fontSize={e.bold ? 18 : 16} fontWeight={e.bold ? 700 : 600} fill={e.color}>
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
      </figcaption>
    </figure>
  );
}
