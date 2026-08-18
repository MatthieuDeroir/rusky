import { CASE_ORDER, CASE_USAGE, explainTrigger, triggersByCase } from "@/lib/cases";

export const dynamic = "force-static";
export const metadata = { title: "Cas · Русский" };

export default function CasPage() {
  const grouped = triggersByCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Cas</h1>
        <p className="mt-1 text-sm text-foreground/55">
          Les 6 cas russes : quand les utiliser, et après quelles prépositions ou quels verbes.
        </p>
      </div>

      {CASE_ORDER.map((c) => {
        const info = CASE_USAGE[c];
        const triggers = grouped[c];
        return (
          <section key={c} className="glass-strong rounded-3xl p-6">
            <h2 className="font-display text-2xl">{info.title}</h2>
            <p className="mt-2 text-sm text-foreground/75">{info.when}</p>
            {info.tip && <p className="mt-2 text-xs text-foreground/45">{info.tip}</p>}

            {triggers.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/10 pt-4">
                {triggers.map((t) => (
                  <span
                    key={t.trigger}
                    title={explainTrigger(t)}
                    className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-foreground/75"
                  >
                    {t.trigger}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
