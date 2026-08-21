import { MAX_LEVEL } from "@/lib/srs";
import { LEVEL_COLOR } from "@/components/level-dot";
import type { MasteryStat } from "@/lib/queries";

/** Une moyenne de maîtrise (0..MAX_LEVEL) en barre — profil. `unit` pluralise le compteur
 * ("mot"/"mots" par défaut, "case"/"cases" pour les moyennes par cas de déclinaison). */
export function MasteryBar({
  label,
  stat,
  unit = "mot",
}: {
  label: string;
  stat: MasteryStat;
  unit?: string;
}) {
  const pct = Math.max(0, Math.min(100, (stat.avg / MAX_LEVEL) * 100));
  const color = LEVEL_COLOR[Math.round(stat.avg)] ?? LEVEL_COLOR[0];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-foreground/80">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-foreground/50">
          {stat.count > 0
            ? `${stat.avg}/${MAX_LEVEL} · ${stat.count} ${unit}${stat.count > 1 ? "s" : ""}`
            : "—"}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
