import Link from "next/link";
import { SUBTEST_LABELS, TRKI1_CONFIG } from "@/lib/exam/config";
import { Badge } from "@/components/ui/badge";
import type { ResultsData } from "@/app/objectif-b1/actions";

function subtestStatus(subtest: keyof typeof TRKI1_CONFIG.subtests, raw: number, toleranceUsedBy: string | null) {
  const cfg = TRKI1_CONFIG.subtests[subtest];
  if (raw >= cfg.pass66) return { label: "Réussi", variant: "default" as const };
  if (raw >= cfg.pass60 && toleranceUsedBy === subtest) return { label: "Toléré", variant: "secondary" as const };
  return { label: "Échoué", variant: "secondary" as const };
}

export function ExamResults({ data }: { data: ResultsData }) {
  const { passResult } = data;

  return (
    <div className="space-y-6">
      {/* Résultat global — jamais un pourcentage global à la place des 5 lignes ci-dessous, la
          condition par sous-test reste la contrainte dominante (docs/adr/0006). */}
      <div className="glass-strong rounded-3xl p-6 text-center">
        <Badge variant={passResult.passed ? "default" : "secondary"} className="text-sm">
          {passResult.passed ? "Examen réussi" : "Examen non réussi"}
        </Badge>
        <p className="mt-3 text-3xl font-semibold">
          {passResult.totalScore}/{TRKI1_CONFIG.total.maxPoints}
          <span className="ml-2 text-base font-normal text-foreground/50">
            (seuil {TRKI1_CONFIG.total.pass})
          </span>
        </p>
        <p className="mt-1 text-sm text-foreground/60">
          {!passResult.totalOk && "Total insuffisant. "}
          {!passResult.perSubtestOk && "Plus d'un sous-test en dessous du seuil de 66 %. "}
          {passResult.toleranceUsedBy
            ? `Tolérance consommée par ${SUBTEST_LABELS[passResult.toleranceUsedBy]}.`
            : "Tolérance encore disponible."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.results.map((r) => {
          const cfg = TRKI1_CONFIG.subtests[r.subtest];
          const status = subtestStatus(r.subtest, r.rawScore, passResult.toleranceUsedBy);
          return (
            <div key={r.subtest} className="glass-strong rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{SUBTEST_LABELS[r.subtest]}</h3>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {r.rawScore}/{r.maxScore}
                <span className="ml-2 text-sm font-normal text-foreground/50">
                  ({Math.round(r.ratio * 100)}%)
                </span>
              </p>
              <p className="mt-1 text-xs text-foreground/45">
                Seuil 66% : {cfg.pass66} pts · plancher 60% : {cfg.pass60} pts
              </p>
            </div>
          );
        })}
      </div>

      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Diagnostic par cible</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.perTarget.map((t, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-white/5 px-4 py-2">
              <span className="text-foreground/70">{t.stem}</span>
              <Badge variant={t.correct ? "default" : "secondary"} className="shrink-0">
                {t.correct ? "✓" : "✗"} {t.targetId}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <Link href="/objectif-b1/examens" className="text-primary hover:underline">
        ← Retour aux examens
      </Link>
    </div>
  );
}
