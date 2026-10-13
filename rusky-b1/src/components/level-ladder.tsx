import type { LevelRung } from "@/lib/learn";
import { cn } from "@/lib/utils";

const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const nf = (n: number) => n.toLocaleString("fr-FR");

const LIST_LABEL: Record<LevelRung["list"], (l: LevelRung) => string> = {
  top: (l) => `les ${nf(l.size)} mots les plus fréquents du lexique B1`,
  b1: () => "le lexique B1",
  b2: () => "le lexique B2 (avec le B1)",
  all: () => "tous les mots connus",
};

/** L'échelle des paliers : pour chacun, la part de sa liste connue (le trait marque son seuil
 * quand il n'est pas la liste entière), où j'en suis et le mois estimé à mon rythme. Les paliers
 * non officiels (« − », « + ») sont plus discrets. */
export function LevelLadder({ rungs }: { rungs: LevelRung[] }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {rungs.map((r) => {
          const plus = /[+−]$/.test(r.code);
          const pct = Math.min(1, r.known / r.size);
          const mark = r.need / r.size;
          const done = r.eta === "atteint";
          return (
            <li key={r.code} className={cn("grid grid-cols-[3rem_1fr] items-center gap-x-3", plus && "opacity-75")}>
              <span className={cn("font-semibold", done ? "text-known" : "text-cobalt", plus ? "text-[15px]" : "text-[17px]")}>
                {r.code}
              </span>
              <span className="min-w-0 space-y-1">
                <span className={cn("relative block overflow-hidden rounded-full bg-[var(--cell-empty)]", plus ? "h-1.5" : "h-2.5")}>
                  <span className={cn("absolute inset-y-0 left-0", done ? "bg-known" : "bg-cobalt")} style={{ width: `${pct * 100}%` }} />
                  {mark < 1 && <span className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `${mark * 100}%` }} />}
                </span>
                <span className="flex flex-wrap justify-between gap-x-3 text-[14px] text-muted">
                  <span className="tabular-nums">
                    {nf(Math.min(r.known, r.need))} / {nf(r.need)} {r.list === "all" ? "mots" : `(${LIST_LABEL[r.list](r)})`}
                  </span>
                  <span>{done ? "atteint" : r.eta ? fmtMonth.format(new Date(r.eta + "-15T12:00:00Z")) : "—"}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[14px] text-faint">
        Chaque palier se mesure sur sa liste de mots, tirée d’une même série : les lexiques minimums officiels du test
        (éd. Zlatoust), chacun incluant le précédent. A1 et A2 n’ont pas de liste publique : ce sont les mots les plus
        fréquents du lexique B1. C1 et C2 n’en ont pas non plus : tous tes mots connus comptent. Un niveau officiel
        est atteint quand toute sa liste est connue. Étapes non officielles : « − » à 80 % de la liste, « + » à
        mi-chemin du « − » suivant. Le mois est estimé à ton rythme moyen sur chaque liste.
      </p>
    </div>
  );
}
