import type { TimelinePoint } from "@/lib/queries";

type Metric = "words" | "forms" | "verbs" | "declensionDiscovered" | "conjugationDiscovered" | "xp";

function buildPath(values: number[], width: number, height: number, pad = 4) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;
  const points = values.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + (height - pad * 2) * (1 - v / max),
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L${last.x.toFixed(1)},${height - pad} L${first.x.toFixed(1)},${height - pad} Z`;
  return { line, area, points };
}

/** Un mini graphique en aire (courbe cumulative) pour une métrique de progression du profil —
 * une seule série par graphique, donc pas de légende nécessaire (le titre la nomme). Point le
 * plus récent marqué ; survol de chaque point pour la valeur exacte du jour (title natif). */
export function ProgressSparkline({
  title,
  points,
  metric,
  suffix = "",
}: {
  title: string;
  points: TimelinePoint[];
  metric: Metric;
  suffix?: string;
}) {
  const values = points.map((p) => p[metric]);
  const width = 320;
  const height = 72;
  const { line, area, points: coords } = buildPath(values, width, height);
  const current = values.at(-1) ?? 0;
  const gradId = `spark-${metric}`;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm text-foreground/70">{title}</h3>
        <span className="text-xl font-semibold tabular-nums">
          {current}
          {suffix}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 3 : 8}
            fill={i === coords.length - 1 ? "var(--primary)" : "transparent"}
          >
            <title>
              {points[i].day} : {values[i]}
              {suffix}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-foreground/40">
        <span>{points[0]?.day}</span>
        <span>{points.at(-1)?.day}</span>
      </div>
    </div>
  );
}
