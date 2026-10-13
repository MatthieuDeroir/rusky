import type { LevelRung, LexiconCoverage } from "@/lib/learn";
import { cn } from "@/lib/utils";

const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const nf = (n: number) => n.toLocaleString("fr-FR");

/** L'échelle des paliers. Chaque palier se mesure sur tous les mots connus (barre principale,
 * mois estimé à mon rythme) ; sous chaque niveau officiel, en plus discret, la part de son
 * lexique conseillé déjà connue. Les paliers non officiels (« − », « + ») sont plus discrets. */
export function LevelLadder({ rungs, lexicons }: { rungs: LevelRung[]; lexicons: LexiconCoverage[] }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {rungs.map((r) => {
          const minor = /[+−]$/.test(r.code);
          const done = r.eta === "atteint";
          const lex = !minor && r.lexicon ? lexicons.find((l) => l.list === r.lexicon) : undefined;
          return (
            <li key={r.code} className={cn("grid grid-cols-[3rem_1fr] items-start gap-x-3", minor && "opacity-75")}>
              <span className={cn("font-semibold", done ? "text-known" : "text-cobalt", minor ? "text-[15px]" : "text-[17px]")}>
                {r.code}
              </span>
              <span className="min-w-0 space-y-1 pt-1.5">
                <span className={cn("relative block overflow-hidden rounded-full bg-[var(--cell-empty)]", minor ? "h-1.5" : "h-2.5")}>
                  <span
                    className={cn("absolute inset-y-0 left-0", done ? "bg-known" : "bg-cobalt")}
                    style={{ width: `${Math.min(1, r.known / r.need) * 100}%` }}
                  />
                </span>
                <span className="flex flex-wrap justify-between gap-x-3 text-[14px] text-muted">
                  <span className="tabular-nums">
                    {nf(Math.min(r.known, r.need))} / {nf(r.need)} mots
                  </span>
                  <span>{done ? "atteint" : r.eta ? fmtMonth.format(new Date(r.eta + "-15T12:00:00Z")) : "—"}</span>
                </span>
                {lex && (
                  <span className="flex items-center gap-2 text-[13px] text-faint">
                    <span className="relative block h-1 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--cell-empty)]">
                      <span className="absolute inset-y-0 left-0 bg-ink/40" style={{ width: `${(lex.known / lex.size) * 100}%` }} />
                    </span>
                    <span className="tabular-nums">
                      {lex.label} : {nf(lex.known)} / {nf(lex.size)}
                    </span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[14px] text-faint">
        Le niveau se mesure sur tous tes mots connus : A1 780, A2 1 300, B1 2 276, B2 5 100, C1 11 000, C2 20 000 (tailles
        des lexiques officiels du test). Étapes non officielles : « − » à 80 % du seuil, « + » à mi-chemin du « − » suivant.
        Sous chaque niveau, la part de son lexique conseillé (éd. Zlatoust ; pas de liste A2 trouvée : lexique A1 et mots
        les plus fréquents du B1). Les leçons comblent d’abord le lexique du plus bas niveau incomplet.
      </p>
    </div>
  );
}
