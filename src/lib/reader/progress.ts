// Avancement dans le curriculum et textes du jour. Toutes les unités restent accessibles (Matthieu
// connaît déjà les bases via Duolingo et peut valider vite les premières) ; l'unité « courante »
// est simplement la première non validée.
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { UNITS, type ReadingUnit } from "./curriculum";
import type { ReaderAnalysis, ReaderAnswer } from "./types";

export type UnitStatus = "done" | "current" | "started" | "todo";

export interface UnitState {
  unit: ReadingUnit;
  status: UnitStatus;
  score: number | null;
  completedAt: Date | null;
}

export async function getUnitStates(userId: string): Promise<{ units: UnitState[]; current: ReadingUnit; level: number }> {
  const rows = await prisma.unitProgress.findMany({ where: { userId } });
  const byId = new Map(rows.map((r) => [r.unitId, r]));
  const current = UNITS.find((u) => !byId.get(u.id)?.completedAt) ?? UNITS[UNITS.length - 1];
  const units = UNITS.map((unit) => {
    const r = byId.get(unit.id);
    const status: UnitStatus = r?.completedAt ? "done" : unit.id === current.id ? "current" : r ? "started" : "todo";
    return { unit, status, score: r?.score ?? null, completedAt: r?.completedAt ?? null };
  });
  // Niveau débloqué = plus haute unité commencée ou validée (au minimum l'unité courante).
  const level = Math.max(current.n, ...rows.map((r) => UNITS.find((u) => u.id === r.unitId)?.n ?? 0));
  return { units, current, level };
}

/** Questions de structure de ces textes : combien de justes du premier coup. */
export async function questionScore(userId: string, textIds: number[]): Promise<{ right: number; total: number; answered: number }> {
  if (textIds.length === 0) return { right: 0, total: 0, answered: 0 };
  const [texts, progress] = await Promise.all([
    prisma.readingText.findMany({ where: { id: { in: textIds } }, select: { id: true, analysis: true } }),
    prisma.readingProgress.findMany({ where: { userId, textId: { in: textIds } } }),
  ]);
  let total = 0;
  for (const t of texts) {
    const a = t.analysis ? (JSON.parse(t.analysis) as ReaderAnalysis) : null;
    total += a?.paragraphs.reduce((n, p) => n + p.questions.length, 0) ?? 0;
  }
  let right = 0;
  let answered = 0;
  for (const p of progress) {
    const answers = Object.values(JSON.parse(p.answers) as Record<string, ReaderAnswer>);
    answered += answers.length;
    right += answers.filter((a) => a.correct).length;
  }
  return { right, total, answered };
}

export function today() {
  return parisDay();
}
