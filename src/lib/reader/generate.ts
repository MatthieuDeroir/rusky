// Génération de textes de lecture par Mistral, calibrés sur le curriculum : la structure de
// l'unité ciblée est mise en avant, seules les structures déjà débloquées sont permises, le
// vocabulaire reste très courant. Le texte est ensuite analysé comme n'importe quel texte collé.
import { prisma } from "@/lib/db";
import { generateReadingText } from "@/lib/mistral";
import { UNITS, type ReadingUnit } from "./curriculum";
import { runAnalysis } from "./analyze";

export type GeneratedPurpose = "daily" | "unit" | "decode";

const THEMES = [
  "une journée ordinaire en ville",
  "un voyage en train à travers la Russie",
  "une visite au marché",
  "une histoire de famille",
  "un souvenir d'enfance à la campagne",
  "une petite anecdote historique",
  "un conte populaire avec des animaux",
  "l'hiver et la neige",
  "une rencontre inattendue",
  "un nouveau travail",
  "un match de football",
  "une recette de cuisine racontée par une grand-mère",
  "un déménagement",
  "une excursion à Saint-Pétersbourg",
  "un chat qui disparaît",
  "une lettre à un ami",
  "un étudiant étranger à Moscou",
  "une soirée d'anniversaire",
  "un orage en été",
  "un vieux livre trouvé au grenier",
];

const SYSTEM = `Tu écris des textes de lecture en russe pour un francophone qui apprend à LIRE le russe (niveau A2 en cours, objectif B1). Le but est d'entraîner la compréhension de la STRUCTURE des phrases (cas, aspect, propositions), pas d'apprendre du vocabulaire rare.

Règles impératives :
- Russe naturel et correct, comme un texte adapté pour apprenants (pas de phrases artificielles).
- Vocabulaire TRÈS courant (environ les 1500 mots les plus fréquents), noms propres russes simples.
- Pas d'accents toniques, pas de translittération, pas de traduction.
- Un récit cohérent avec un début et une fin, des paragraphes séparés par une ligne vide.
- Réponds UNIQUEMENT en JSON.`;

function allowedUnits(level: number): ReadingUnit[] {
  return UNITS.filter((u) => u.n <= Math.max(1, level));
}

function structureBrief(target: ReadingUnit | undefined, level: number): string {
  const allowed = allowedUnits(level);
  const forbidden = UNITS.filter((u) => u.n > Math.max(1, level));
  const lines = [
    target
      ? `STRUCTURE À METTRE EN AVANT (au moins une occurrence par phrase ou presque) : ${target.title} — ${target.generationFocus}.`
      : "Mélange de manière équilibrée les structures autorisées ci-dessous.",
    `Structures autorisées : ${allowed.map((u) => u.title).join(" ; ")}.`,
  ];
  if (forbidden.length) {
    lines.push(
      `À ÉVITER (pas encore étudié) : ${forbidden.map((u) => u.title).join(" ; ")}. Si une phrase en aurait besoin, reformule-la plus simplement.`,
    );
  }
  return lines.join("\n");
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

interface GenOptions {
  purpose: GeneratedPurpose;
  /** Unité dont la structure est mise en avant (null = mélange des structures débloquées). */
  unitId: string | null;
  /** Numéro de la plus haute unité débloquée. */
  level: number;
}

async function generateBody(opts: GenOptions): Promise<{ title: string; body: string }> {
  const target = UNITS.find((u) => u.id === opts.unitId);
  const theme = pick(THEMES);
  if (opts.purpose === "decode") {
    const user = `Écris UNE seule phrase russe de 12 à 20 mots, dense mais naturelle, qui demande de bien lire les terminaisons pour savoir qui fait quoi (par exemple sujet placé après le verbe, COD en tête, ou proposition subordonnée).
${structureBrief(target, opts.level)}
Thème : ${theme}.
JSON : {"sentence": "<la phrase>"}`;
    const raw = (await generateReadingText(SYSTEM, user)) as { sentence?: unknown };
    const sentence = typeof raw.sentence === "string" ? raw.sentence.trim() : "";
    if (!/[а-яё]/i.test(sentence)) throw new Error("Phrase générée vide");
    return { title: "Phrase à décortiquer", body: sentence };
  }
  const words = opts.purpose === "daily" ? "70 à 120 mots, 2 ou 3 paragraphes" : "150 à 220 mots, 3 ou 4 paragraphes";
  const user = `Écris un texte de ${words}.
${structureBrief(target, opts.level)}
Thème : ${theme}.
JSON : {"title": "<titre court en russe>", "text": "<le texte, paragraphes séparés par \\n\\n>"}`;
  const raw = (await generateReadingText(SYSTEM, user)) as { title?: unknown; text?: unknown };
  const body = typeof raw.text === "string" ? raw.text.trim() : "";
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Texte";
  if (!/[а-яё]/i.test(body) || body.length < 80) throw new Error("Texte généré vide ou trop court");
  return { title, body };
}

/** Crée la ligne tout de suite (pour que l'UI puisse l'afficher et la sonder), à remplir ensuite
 * par fillGeneratedText — en tâche de fond via after() côté actions. */
export async function createGeneratedPlaceholder(
  userId: string,
  opts: GenOptions & { forDay?: string | null },
): Promise<number> {
  const row = await prisma.readingText.create({
    data: {
      userId,
      source: "generated",
      purpose: opts.purpose,
      unitId: opts.unitId,
      forDay: opts.forDay ?? null,
      title: opts.purpose === "decode" ? "Phrase à décortiquer" : "Texte en préparation…",
      body: "",
      status: "GENERATING",
    },
  });
  return row.id;
}

/** Génère (deux essais) puis analyse. Ne lève jamais : un échec laisse le texte en FAILED. */
export async function fillGeneratedText(id: number, opts: GenOptions): Promise<void> {
  let gen: { title: string; body: string } | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !gen; attempt++) {
    try {
      gen = await generateBody(opts);
    } catch (e) {
      lastError = e;
    }
  }
  if (!gen) {
    await prisma.readingText.update({
      where: { id },
      data: { status: "FAILED", error: lastError instanceof Error ? lastError.message.slice(0, 300) : "Génération impossible" },
    });
    return;
  }
  await prisma.readingText.update({
    where: { id },
    data: { title: gen.title, body: gen.body, status: "PENDING", analysis: null, analysisVersion: null },
  });
  await runAnalysis(id);
}
