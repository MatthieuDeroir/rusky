// Le dictionnaire (OpenRussian) n'a ni participes ni gérondifs. Plutôt que de générer ~1 M de
// formes, on VÉRIFIE après coup l'analyse de l'IA : quand elle dit « participe/gérondif de
// построить », on reconstruit les radicaux possibles depuis les formes connues du verbe
// (3e pl. présent, 1re pl., passé masc., infinitif, 1re sg.) et on regarde si le mot lu en est
// bien un dérivé régulier. Pur, sans base.
import { normalizeBare } from "@/lib/grammar";

/** Terminaisons d'adjectif long (avec ou sans -ся) et de forme courte passive. */
const ADJ_ENDINGS = [
  "ий", "ый", "его", "ого", "ему", "ому", "им", "ым", "ем", "ом",
  "ая", "ей", "ой", "ую", "ее", "ое", "ие", "ые", "их", "ых", "ими", "ыми",
];
const SHORT_ENDINGS = ["", "а", "о", "ы"];

export interface VerbForms {
  infinitive: string;
  pl3?: string; // читают
  pl1?: string; // читаем
  sg1?: string; // читаю
  pastM?: string; // читал
}

function stripRefl(s: string): { base: string; refl: boolean } {
  if (s.endsWith("ся") || s.endsWith("сь")) return { base: s.slice(0, -2), refl: true };
  return { base: s, refl: false };
}

/** Le mot lu est-il un participe ou un gérondif régulier de ce verbe ? */
export function isDerivedVerbForm(word: string, forms: VerbForms): boolean {
  const { base: w } = stripRefl(normalizeBare(word));
  const clean = (x?: string) => (x ? stripRefl(normalizeBare(x.split(",")[0])).base : undefined);
  const pl3 = clean(forms.pl3);
  const pl1 = clean(forms.pl1);
  const sg1 = clean(forms.sg1);
  const past = clean(forms.pastM);
  const inf = clean(forms.infinitive)!;

  const longStems: string[] = [];
  const shortStems: string[] = [];
  const gerunds: string[] = [];

  if (pl3 && /[ую]т$|[ая]т$/.test(pl3)) {
    longStems.push(pl3.slice(0, -1) + "щ"); // читают → читающ-
    const st = pl3.slice(0, -2); // чита-
    gerunds.push(st + "я", st + "а"); // читая, слыша
  }
  if (pl1) longStems.push(pl1); // читаем → читаем-ый
  if (past) {
    if (past.endsWith("л")) {
      const st = past.slice(0, -1);
      longStems.push(st + "вш"); // читавш-
      gerunds.push(st + "в", st + "вши");
    } else {
      longStems.push(past + "ш"); // нёсш-
      gerunds.push(past + "ши");
    }
  }
  if (inf) {
    const st = inf.replace(/ть$|ти$|чь$/, "");
    if (/[ая]$/.test(st)) passive(st + "нн", st + "н"); // прочитанн-
    if (/[иеэ]$/.test(st)) passive(st.slice(0, -1) + "енн", st.slice(0, -1) + "ен"); // увиденн-
    passive(st + "т", st + "т"); // открыт-, взят-
  }
  if (sg1 && /[юу]$/.test(sg1)) passive(sg1.slice(0, -1) + "енн", sg1.slice(0, -1) + "ен"); // куплю → купленн-

  function passive(long: string, short: string) {
    longStems.push(long);
    shortStems.push(short);
  }

  if (gerunds.includes(w)) return true;
  for (const s of longStems) if (w.startsWith(s) && ADJ_ENDINGS.includes(w.slice(s.length))) return true;
  for (const s of shortStems) if (w.startsWith(s) && SHORT_ENDINGS.includes(w.slice(s.length))) return true;
  return false;
}
