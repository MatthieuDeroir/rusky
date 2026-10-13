import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { generateReadingText } from "@/lib/mistral";
import { runAnalysis } from "@/lib/reader/analyze";
import { bodyCoverage, familiarEntryIds, ratio } from "@/lib/coverage";

/** Question de compréhension du CONTENU, façon ТРКИ : question et options en russe, avec leur
 * traduction pour s'aider au début. */
export interface ComprehensionQuestion {
  id: string;
  q: string;
  qFr: string;
  options: string[];
  optionsFr: string[];
  answer: number;
  explain: string;
}

export interface TextAnswer {
  choice: number;
  correct: boolean;
}

const THEMES = [
  "une journée au travail",
  "un week-end à la campagne",
  "faire les courses au marché",
  "un voyage en train",
  "une rencontre entre voisins",
  "la météo et les saisons",
  "un repas en famille",
  "chercher un appartement",
  "un rendez-vous chez le médecin",
  "les études à l'université",
  "un anniversaire",
  "le sport et la santé",
  "une ville russe et son histoire",
  "un petit problème au quotidien",
  "les vacances d'été",
  "un nouveau travail",
];

/** Longueur et difficulté selon le nombre de mots du lexique B1 déjà connus. */
function levelBrief(knownB1: number): { level: number; words: string; grammar: string } {
  if (knownB1 < 500)
    return {
      level: 1,
      words: "80 à 120 mots",
      grammar: "phrases courtes, présent et passé, cas simples (nominatif, accusatif, prépositionnel de lieu), pas de participes",
    };
  if (knownB1 < 1000)
    return {
      level: 2,
      words: "120 à 180 mots",
      grammar: "tous les cas, passé et futur, quelques subordonnées (что, когда, потому что), pas de participes",
    };
  if (knownB1 < 1500)
    return {
      level: 3,
      words: "180 à 250 mots",
      grammar: "subordonnées variées (который, чтобы, если), aspect, verbes de mouvement, rares participes",
    };
  return {
    level: 4,
    words: "250 à 350 mots",
    grammar: "niveau B1 : participes et gérondifs occasionnels, constructions impersonnelles, style d'un article simple",
  };
}

const SYSTEM = `Tu écris des textes de lecture pour un francophone qui prépare le ТРКИ-1 (B1 de russe).
Le texte doit être naturel, cohérent, avec une petite histoire ou une information concrète, en russe moderne correct, SANS accents toniques.
Puis tu écris 4 questions de compréhension du CONTENU, comme à l'épreuve « Чтение » du ТРКИ : on vérifie qu'on a compris qui, quoi, où, quand, pourquoi.
Chaque question a 3 options en russe, une seule correcte, les fausses plausibles mais clairement contredites par le texte.
Réponds en JSON :
{"title":"titre russe court","text":"le texte, paragraphes séparés par \\n","questions":[{"q":"question en russe","qFr":"traduction française","options":["…","…","…"],"optionsFr":["…","…","…"],"answer":0,"explain":"en français : où le texte donne la réponse (cite le passage russe)"}]}`;

interface Generated {
  title?: string;
  text?: string;
  questions?: Omit<ComprehensionQuestion, "id">[];
}

function shuffleQuestion(q: Omit<ComprehensionQuestion, "id">, i: number): ComprehensionQuestion {
  // L'IA met souvent la bonne réponse en premier : on la déplace de façon déterministe.
  const n = q.options.length;
  const target = (i * 7 + q.q.length) % n;
  const order = [...Array(n).keys()];
  [order[q.answer], order[target]] = [order[target], order[q.answer]];
  return {
    id: `c${i}`,
    q: q.q,
    qFr: q.qFr,
    options: order.map((k) => q.options[k]),
    optionsFr: order.map((k) => q.optionsFr?.[k] ?? ""),
    answer: order.indexOf(q.answer),
    explain: q.explain,
  };
}

function validQuestions(qs: Generated["questions"]): ComprehensionQuestion[] {
  return (qs ?? [])
    .filter(
      (q) =>
        q &&
        typeof q.q === "string" &&
        Array.isArray(q.options) &&
        q.options.length >= 3 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < q.options.length,
    )
    .slice(0, 5)
    .map(shuffleQuestion);
}

/** Crée la ligne tout de suite (statut GENERATING) ; le contenu est rempli en tâche de fond. */
export async function createDailyText(userId: string, { fresh = false } = {}): Promise<number> {
  const day = parisDay();
  // Le plus récent du jour : « Un autre texte » en ajoute un sans écraser le précédent (ni ses réponses).
  const existing = fresh
    ? null
    : await prisma.text.findFirst({ where: { userId, forDay: day, source: "generated" }, orderBy: { id: "desc" } });
  if (existing) return existing.id;
  const t = await prisma.text.create({
    data: { userId, source: "generated", title: "Texte du jour", body: "", status: "GENERATING", forDay: day },
  });
  return t.id;
}

/** Part minimale de mots familiers visée (règle « i+1 » : on comprend presque tout, on apprend un peu). */
export const TARGET_COVERAGE = 0.85;
const MAX_ATTEMPTS = 2;
const NEW_WORDS_PER_TEXT = 4;
/** Texte de leçon : 10 mots nouveaux imposés ; on accepte qu'un seul manque. */
const LESSON_ATTEMPTS = 3;
const MAX_MISSING = 1;
/** Entraînement « mots connus » : presque tout doit être connu. */
const PRACTICE_COVERAGE = 0.95;
/** Les mots du parcours jusqu'à ce rang sont autorisés même pas encore appris (les plus fréquents). */
const FREE_RANK = 500;

/** 'level' = texte du jour (i+1 : quelques mots nouveaux) ; 'known' = entraînement, uniquement
 * avec les mots connus (lecture fluide, aucun mot nouveau). */
export type TextMode = "level" | "known";

export async function fillGeneratedText(textId: number, userId: string, mode: TextMode = "level"): Promise<void> {
  try {
    const practice = mode === "known";
    const row = await prisma.text.findUnique({ where: { id: textId }, select: { newEntryIds: true } });
    // Texte de leçon : les mots nouveaux sont fixés à la création (réservés pour cette leçon).
    const imposed = !practice && row?.newEntryIds ? (JSON.parse(row.newEntryIds) as number[]) : null;
    const [knownB1, mine, upcoming, familiar] = await Promise.all([
      prisma.word.count({ where: { userId, status: "KNOWN", entry: { b1Rank: { not: null } } } }),
      // Texte du jour : le vocabulaire B1 de l'apprenant (connu + en cours) — c'est sur lui que
      // l'examen porte. Entraînement : seulement les mots CONNUS (B1 d'abord, puis les autres).
      prisma.word.findMany({
        where: practice ? { userId, status: "KNOWN" } : { userId, entry: { b1Rank: { not: null } } },
        orderBy: { entry: { b1Rank: { sort: "asc", nulls: "last" } } },
        take: 900,
        select: { status: true, entry: { select: { bare: true } } },
      }),
      // Les prochains mots du parcours : ceux que le texte du jour introduit.
      practice
        ? Promise.resolve([] as { id: number; bare: string; glossFr: string | null }[])
        : prisma.dictionaryEntry.findMany({
            where: imposed ? { id: { in: imposed } } : { b1Rank: { not: null }, words: { none: { userId } } },
            orderBy: { b1Rank: "asc" },
            take: imposed ? imposed.length : NEW_WORDS_PER_TEXT,
            select: { id: true, bare: true, glossFr: true },
          }),
      familiarEntryIds(userId, practice ? { knownOnly: true } : { b1Only: true }),
    ]);
    const brief = levelBrief(knownB1);
    // Texte du jour : autorisés sans pénalité les mots familiers, les mots imposés et les mots les
    // plus fréquents du B1 (appris dans les jours qui viennent). Entraînement : les mots connus seuls.
    const frequent = practice
      ? []
      : await prisma.dictionaryEntry.findMany({ where: { b1Rank: { lt: FREE_RANK } }, select: { id: true } });
    const allowed = new Set([...familiar, ...upcoming.map((u) => u.id), ...frequent.map((f) => f.id)]);
    const target = practice ? PRACTICE_COVERAGE : TARGET_COVERAGE;
    const attempts = practice ? 3 : imposed ? LESSON_ATTEMPTS : MAX_ATTEMPTS;

    const day = parisDay();
    // Un thème différent pour chaque texte : du jour (par date), d'entraînement (par nombre).
    const rank = practice
      ? await prisma.text.count({ where: { userId, source: "practice", id: { lt: textId } } })
      : await prisma.text.count({ where: { userId, forDay: day, source: "generated", id: { lt: textId } } });
    const theme = THEMES[([...day].reduce((a, c) => a + c.charCodeAt(0), 0) + rank * 5 + (practice ? 3 : 0)) % THEMES.length];
    const user = (
      practice
        ? [
            `Thème : ${theme} (adapte librement le thème au vocabulaire disponible).`,
            `Longueur : 60 à 120 mots. Grammaire : ${brief.grammar}.`,
            "But : un texte d'ENTRAÎNEMENT que l'apprenant peut lire sans aucune aide.",
            "Vocabulaire — règle stricte : n'emploie QUE les mots de la liste ci-dessous (toutes formes fléchies permises), plus les mots-outils (prépositions, conjonctions, pronoms, particules) et des prénoms. Aucun autre mot plein.",
            "S'il manque un mot pour une idée, change d'idée ou fais une phrase plus simple : le texte doit rester naturel et logique, quitte à être très simple.",
            `Mots que l'apprenant connaît : ${mine.map((w) => w.entry.bare).join(", ")}.`,
            "Les questions et les options n'emploient aussi que ces mots.",
          ]
        : [
            `Thème : ${theme} (adapte le thème au vocabulaire disponible).`,
            `Longueur : ${brief.words}.`,
            `Grammaire : ${brief.grammar}.`,
            "PRIORITÉ ABSOLUE : un texte qui a du sens, des phrases qu'un Russe écrirait vraiment, une histoire logique.",
            "Vocabulaire : appuie-toi d'abord sur les mots ci-dessous (toutes formes fléchies permises) et sur les mots les plus courants du russe. S'il te manque un mot, prends un mot simple et très courant plutôt qu'une tournure bizarre ou fausse. Évite les mots rares ou techniques. Les prénoms sont permis.",
            `Mots du lexique B1 que l'apprenant connaît : ${mine.map((w) => w.entry.bare).join(", ")}.`,
            imposed
              ? `MOTS NOUVEAUX OBLIGATOIRES — emploie CHACUN de ces ${upcoming.length} mots au moins une fois (forme fléchie permise), dans une phrase où le contexte aide à deviner le sens ; construis l'histoire autour d'eux : ${upcoming
                  .map((u) => `${u.bare} (${u.glossFr ?? "?"})`)
                  .join(", ")}.`
              : upcoming.length
              ? `Mots nouveaux à introduire si (et seulement si) ils s'intègrent naturellement dans l'histoire, dans un contexte qui aide à deviner le sens : ${upcoming
                  .map((u) => `${u.bare} (${u.glossFr ?? "?"})`)
                  .join(", ")}.`
              : "",
            "Les questions et les options n'emploient aussi que ce vocabulaire.",
          ]
    ).join("\n");

    // On garde le meilleur essai ; on s'arrête dès que la couverture visée est atteinte.
    let best: { out: Generated; questions: ComprehensionQuestion[]; coverage: number; missing: number } | null = null;
    let prompt = user;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const out = (await generateReadingText(SYSTEM, prompt)) as Generated;
      const questions = validQuestions(out.questions);
      if (!out.text || !/[а-яё]/i.test(out.text) || questions.length < 3) continue;
      const cov = await bodyCoverage(out.text, allowed);
      const missing = imposed ? upcoming.filter((u) => !cov.seen.has(u.id)) : [];
      console.log(
        `[texts] ${textId} essai ${attempt + 1} : couverture ${Math.round(ratio(cov) * 100)} %${imposed ? `, ${missing.length} mot(s) imposé(s) absent(s)` : ""}`,
      );
      // Meilleur essai : le moins de mots imposés manquants, puis la meilleure couverture.
      if (!best || missing.length < best.missing || (missing.length === best.missing && ratio(cov) > best.coverage))
        best = { out, questions, coverage: ratio(cov), missing: missing.length };
      if (ratio(cov) >= target && missing.length <= MAX_MISSING) break;
      // Essai suivant : réviser CE texte en remplaçant précisément les mots hors liste — bien plus
      // efficace que de tout réécrire en espérant mieux.
      prompt = [
        user,
        "",
        "Voici ta version précédente :",
        JSON.stringify({ title: out.title, text: out.text, questions: out.questions }),
        `Ces mots sont trop difficiles pour l'apprenant : ${cov.unknown.filter((w) => !upcoming.some((u) => u.bare === w)).join(", ")}.`,
        missing.length ? `Tu as oublié ces mots nouveaux obligatoires, ajoute-les : ${missing.map((u) => u.bare).join(", ")}.` : "",
        practice
          ? "Remplace chacun d'eux par un mot de la liste, ou réécris la phrase autrement avec les mots de la liste (ou supprime-la). Le texte doit rester naturel et logique. Même format JSON."
          : "Remplace ceux que tu peux par un mot plus simple ou courant, sans rendre une phrase bizarre : si un remplacement abîme le sens, garde le mot. Garde l'histoire, sa logique et le naturel. Même format JSON.",
      ].join("\n");
    }
    if (!best) throw new Error("Texte généré incomplet");
    await prisma.text.update({
      where: { id: textId },
      data: {
        title: best.out.title?.trim() || (practice ? "Тренировка" : "Текст дня"),
        body: best.out.text!.replace(/\r\n?/g, "\n").trim(),
        level: brief.level,
        questions: JSON.stringify(best.questions),
        status: "PENDING",
        error: null,
      },
    });
    await runAnalysis(textId);
  } catch (e) {
    console.error("[texts] génération", textId, e);
    await prisma.text.update({
      where: { id: textId },
      data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 300) : "Erreur" },
    });
  }
}

/** Questions de compréhension d'un texte qui n'en a pas encore (corpus, texte collé). */
export async function ensureQuestions(textId: number): Promise<void> {
  const t = await prisma.text.findUnique({ where: { id: textId } });
  if (!t || t.questions || !t.body) return;
  const out = (await generateReadingText(
    SYSTEM.replace("Tu écris des textes de lecture", "Tu prépares des questions de lecture").replace(
      "Puis tu écris 4 questions",
      "Le texte est FOURNI (ne le réécris pas, renvoie title et text vides). Écris 4 questions",
    ),
    `Texte :\n${t.body.slice(0, 5000)}`,
  )) as Generated;
  const questions = validQuestions(out.questions);
  if (questions.length) await prisma.text.update({ where: { id: textId }, data: { questions: JSON.stringify(questions) } });
}
