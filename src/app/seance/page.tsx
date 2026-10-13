import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { currentUserId } from "@/lib/auth";
import { getUnitStates } from "@/lib/reader/progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Séance · Русский" };

export default async function SeancePage() {
  const userId = await currentUserId();
  const { units, current } = await getUnitStates(userId);
  const done = units.filter((u) => u.status === "done").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Séance du week-end</h1>
        <p className="text-sm text-foreground/55">
          Une structure par week-end : 12 unités pour lire le russe en janvier. {done}/12 validée{done > 1 ? "s" : ""}.
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(done / 12) * 100}%` }} />
        </div>
      </div>

      <Link href={`/seance/${current.id}`} className="glass-strong glass-lift block rounded-3xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
          {units.find((u) => u.unit.id === current.id)?.status === "done" ? "Revoir" : "Ce week-end"} · Unité {current.n}
        </p>
        <p className="mt-1 font-display text-2xl">{current.title}</p>
        <p className="mt-1 text-sm text-foreground/60">{current.goal}</p>
        <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Commencer / reprendre <ArrowRight className="size-4" />
        </p>
      </Link>

      <ol className="space-y-2">
        {units.map(({ unit, status, score }) => (
          <li key={unit.id}>
            <Link
              href={`/seance/${unit.id}`}
              className={`glass flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-white/10 ${
                status === "current" ? "ring-1 ring-primary/40" : ""
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  status === "done" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/8 text-foreground/60"
                }`}
              >
                {status === "done" ? <Check className="size-4" /> : unit.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{unit.title}</p>
                <p className="truncate text-xs text-foreground/50">
                  {status === "done"
                    ? `Validée${score !== null ? ` · ${Math.round(score * 100)} % de questions justes` : ""}`
                    : status === "started"
                      ? "Commencée"
                      : unit.goal}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
