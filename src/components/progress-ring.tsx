interface ProgressRingProps {
  value: number; // 0..total
  total: number;
  size?: number;
  label?: string; // center text override (defaults to "value/total")
}

export function ProgressRing({ value, total, size = 44, label }: ProgressRingProps) {
  const pct = total > 0 ? value / total : 0;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-[11px] font-medium tabular-nums text-foreground/80">
        {label ?? `${value}/${total}`}
      </span>
    </div>
  );
}
