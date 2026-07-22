// Data for the "Cas" exercise: which case(s) a trigger (preposition / verb rection) governs,
// plus short French usage notes per case. Derived from the offline government tables in
// sentence.ts so it stays in sync with the sentence checker. No DB / server deps → usable
// from both client components and server actions.
import { CASE_FR, PREPOSITION_CASES, VERB_CASES } from "./sentence";
import type { CaseCode } from "./grammar";

export { CASE_FR };

export const CASE_ORDER: CaseCode[] = ["nom", "acc", "gen", "dat", "inst", "prep"];

export type TriggerKind = "préposition" | "verbe";

export interface CaseTrigger {
  trigger: string;
  kind: TriggerKind;
  cases: CaseCode[]; // the case(s) it can govern (a preposition may allow several)
}

/** When to use each case (short FR notes + an optional memory tip for the lesson view). */
export const CASE_USAGE: Record<CaseCode, { title: string; when: string; tip?: string }> = {
  nom: {
    title: "Nominatif",
    when: "Le sujet de la phrase — ce/celui qui fait l’action. Forme du dictionnaire.",
    tip: "Question : кто? что? (qui ? quoi ?). C’est qui/quoi FAIT l’action. Брат чита́ет (le frère lit).",
  },
  acc: {
    title: "Accusatif",
    when: "Le complément d’objet direct (quoi/qui). Direction après в / на (mouvement).",
    tip: "Question : кого? что? (qui ? quoi ? — l’objet de l’action). Я чита́ю кни́гу. Et куда ? (vers où) → в / на + accusatif = mouvement : я иду́ в шко́лу.",
  },
  gen: {
    title: "Génitif",
    when: "Possession, absence, quantité. Après beaucoup de prépositions (без, для, от, после, у…).",
    tip: "Question : кого? чего? (de qui ? de quoi ?). L’idée de « de » : possession (кни́га бра́та), absence (нет вре́мени), quantité (мно́го книг).",
  },
  dat: {
    title: "Datif",
    when: "Le destinataire (à qui). Après к, по ; verbes comme помогать, звонить, нравиться.",
    tip: "Question : кому? чему? (à qui ? à quoi ?). Le destinataire : я звоню́ дру́гу (je téléphone à un ami). к + datif = chez / vers qqn.",
  },
  
  inst: {
    title: "Instrumental",
    when: "Le moyen / l’instrument (avec quoi). Après с, за, под ; verbes заниматься, интересоваться.",
    tip: "Question : кем? чем? (par qui ? avec quoi ?). Le moyen : писа́ть ру́чкой (écrire avec un stylo). с + inst = « avec » ; за / под + inst = position statique (под столо́м).",
  },
  prep: {
    title: "Prépositionnel",
    when: "Toujours après une préposition (в, на, о, при). Le lieu, le sujet de la pensée.",
    tip: "Question : о ком? о чём? / где? (à propos de quoi ? où ?). Jamais seul : в / на + prépositionnel = lieu où l’on est (я в шко́ле). À opposer à l’accusatif (mouvement).",
  },
};

/** The distinction for prepositions that take several cases. */
const NUANCE: Record<string, string> = {
  в: "accusatif = direction (mouvement vers), prépositionnel = lieu où l’on est.",
  во: "accusatif = direction (mouvement vers), prépositionnel = lieu où l’on est.",
  на: "accusatif = direction (mouvement vers), prépositionnel = lieu où l’on est.",
  за: "accusatif = mouvement (aller derrière / chercher), instrumental = position (derrière).",
  под: "accusatif = mouvement (aller sous), instrumental = position (sous).",
  подо: "accusatif = mouvement (aller sous), instrumental = position (sous).",
  с: "génitif = depuis / en venant de, instrumental = avec.",
  со: "génitif = depuis / en venant de, instrumental = avec.",
  о: "prépositionnel = au sujet de.",
};

/** All triggers (prepositions — including multi-case — and rection verbs). */
export function caseTriggers(): CaseTrigger[] {
  const out: CaseTrigger[] = [];
  for (const [prep, cases] of Object.entries(PREPOSITION_CASES)) {
    out.push({ trigger: prep, kind: "préposition", cases });
  }
  for (const [verb, cas] of Object.entries(VERB_CASES)) {
    out.push({ trigger: verb, kind: "verbe", cases: [cas] });
  }
  return out;
}

/** Info for a given trigger, or null if unknown. */
export function triggerCase(trigger: string): CaseTrigger | null {
  return caseTriggers().find((t) => t.trigger === trigger) ?? null;
}

/** Triggers grouped by case — a multi-case preposition appears under each of its cases. */
export function triggersByCase(): Record<CaseCode, CaseTrigger[]> {
  const grouped = { nom: [], gen: [], dat: [], acc: [], inst: [], prep: [] } as Record<
    CaseCode,
    CaseTrigger[]
  >;
  for (const t of caseTriggers()) for (const c of t.cases) grouped[c].push(t);
  return grouped;
}

/** A short FR explanation of which case(s) a trigger governs (with the nuance if relevant). */
export function explainTrigger(t: CaseTrigger): string {
  const list = t.cases.map((c) => CASE_FR[c]).join(" ou ");
  const base =
    t.kind === "préposition"
      ? `Après « ${t.trigger} » : ${list}.`
      : `Le verbe « ${t.trigger} » se construit avec ${list}.`;
  return NUANCE[t.trigger] ? `${base} ${NUANCE[t.trigger]}` : base;
}
