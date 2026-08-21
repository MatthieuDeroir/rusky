import { MAX_LEVEL } from "@/lib/srs";

// Mastery at a glance: a small bar whose fill and colour track a 0..MAX_LEVEL mastery level
// (0 = never practised / dropped back to zero, MAX_LEVEL = mastered). Shared by the Collection
// (mastery of the base form) and the paradigm table (mastery of each individual cell).
export const LEVEL_COLOR = [
  "bg-white/15", // 0 — à apprendre
  "bg-red-400/70", // 1 — fragile
  "bg-orange-400/70", // 2 — en cours
  "bg-amber-400/80", // 3 — solide
  "bg-lime-400/80", // 4 — ancré
  "bg-emerald-400", // 5 — maîtrisé
];

export function LevelDot({
  level,
  title,
  className,
}: {
  level: number;
  title: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`flex h-6 w-1 shrink-0 flex-col-reverse gap-px overflow-hidden rounded-full bg-white/8 ${className ?? ""}`}
    >
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={`flex-1 ${i < level ? LEVEL_COLOR[level] : "bg-transparent"}`} />
      ))}
    </span>
  );
}
