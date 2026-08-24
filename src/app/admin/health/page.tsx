import { BackButton } from "@/components/back-button";
import { getValidationHealthAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Santé validation · Admin · Русский" };

export default async function HealthPage() {
  const stats = await getValidationHealthAction();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Santé de la validation</h1>
        <p className="text-sm text-foreground/55">
          Taux de rejet par passe et par typeId — le meilleur outil de debug de prompts (§11 spec).
        </p>
      </div>
      {stats.length === 0 ? (
        <p className="text-sm text-foreground/50">Aucune génération pour l’instant.</p>
      ) : (
        <div className="space-y-4">
          {stats.map((s) => (
            <div key={s.typeId} className="glass-strong rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{s.typeId}</h2>
                <span className="text-sm text-foreground/50">
                  {s.totalGenerated} tentatives · {s.quarantinedCount} en quarantaine
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {s.rejectRateByPass.map((r) => (
                  <li key={r.name} className="flex items-center justify-between">
                    <span className="text-foreground/70">
                      Passe {r.pass} · {r.name}
                    </span>
                    <span className="font-medium">{Math.round(r.rejectRate * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
