import "server-only";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { chatJson, generateReadingText } from "@/lib/mistral";
import { splitParagraphs, splitSentences } from "@/lib/reader/segment";
import { runAnalysis } from "@/lib/reader/analyze";
import { bodyCoverage, familiarEntryIds, ratio } from "@/lib/coverage";
import { lexiconCoverage, LEXICONS, listWhere } from "@/lib/learn";

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
/** Texte de leçon : 95 % de mots CONNUS sur la longueur du texte ; les 5 % restants sont les mots
 * nouveaux (du lexique en cours de préférence, sinon du suivant), soulignés à la lecture. */
const LESSON_ATTEMPTS = 3;
export const LESSON_COVERAGE = 0.95;
/** Passes de correction ciblée : réécrire seulement les phrases qui contiennent le plus d'inconnus. */
const REPAIR_PASSES = 8;
const REPAIR_SENTENCES = 3;
/** Entraînement « mots connus » : presque tout doit être connu. */
const PRACTICE_COVERAGE = 0.95;
/** Les mots du parcours jusqu'à ce rang sont autorisés même pas encore appris (les plus fréquents). */
const FREE_RANK = 500;

/** 'level' = texte de niveau (Lire : quelques mots nouveaux) ; 'known' = entraînement, uniquement
 * avec les mots connus ; 'lesson' = texte de leçon (95 % de mots connus, 5 % de mots nouveaux). */
export type TextMode = "level" | "known" | "lesson";

/** Longueur du texte de leçon : les mots nouveaux prévus par la mémoire forment 5 % du texte. */
export function lessonLength(newWords: number): number {
  return Math.round(Math.min(260, Math.max(100, newWords / (1 - LESSON_COVERAGE))));
}

export async function fillGeneratedText(textId: number, userId: string, mode: TextMode = "level", lessonWords = 10): Promise<void> {
  try {
    const practice = mode === "known";
    const lesson = mode === "lesson";
    // Vocabulaire strict (mots appris seulement, lexique B2 max) : entraînement et leçon.
    const strict = practice || lesson;
    const [knownB1, mine, upcoming, familiar] = await Promise.all([
      prisma.word.count({ where: { userId, learnedAt: { not: null }, entry: { b1Rank: { not: null } } } }),
      prisma.word.findMany({
        where: strict ? { userId, learnedAt: { not: null }, entry: listWhere("b2") } : { userId, entry: { b1Rank: { not: null } } },
        orderBy: { entry: { b1Rank: { sort: "asc", nulls: "last" } } },
        take: strict ? 3000 : 900,
        select: { entry: { select: { bare: true } } },
      }),
      // Texte de niveau (Lire) : les prochains mots du parcours, à introduire si naturel.
      strict
        ? Promise.resolve([] as { id: number; bare: string; glossFr: string | null }[])
        : prisma.dictionaryEntry.findMany({
            where: { b1Rank: { not: null }, words: { none: { userId } } },
            orderBy: { b1Rank: "asc" },
            take: NEW_WORDS_PER_TEXT,
            select: { id: true, bare: true, glossFr: true },
          }),
      familiarEntryIds(userId, strict ? { knownOnly: true, inLexicons: true } : { b1Only: true }),
    ]);
    // Texte de leçon : les mots nouveaux viennent du lexique en cours, ou du suivant (niveau +1) ;
    // tout autre mot inconnu est « hors niveau » et sera remplacé.
    let stretch = new Set<number>();
    let focusWords: { bare: string; gloss: string }[] = [];
    let nextWords: string[] = [];
    if (lesson) {
      const { focus } = await lexiconCoverage(userId);
      const i = Math.max(0, LEXICONS.findIndex((l) => l.list === focus));
      const focusList = LEXICONS[i].list;
      const nextList = LEXICONS[Math.min(LEXICONS.length - 1, i + 1)].list;
      const notLearned = { words: { none: { userId, learnedAt: { not: null } } } };
      const order = [{ b1Rank: { sort: "asc" as const, nulls: "last" as const } }, { id: "asc" as const }];
      const [inFocus, inNext] = await Promise.all([
        prisma.dictionaryEntry.findMany({
          where: { AND: [listWhere(focusList), notLearned] },
          orderBy: order,
          select: { id: true, bare: true, glossFr: true, translationsFr: true },
        }),
        prisma.dictionaryEntry.findMany({ where: { AND: [listWhere(nextList), notLearned] }, orderBy: order, select: { id: true, bare: true } }),
      ]);
      stretch = new Set([...inFocus.map((e) => e.id), ...inNext.map((e) => e.id)]);
      focusWords = inFocus.slice(0, 80).map((e) => ({ bare: e.bare, gloss: e.glossFr ?? e.translationsFr?.split(/[,;]/)[0] ?? "" }));
      const focusSet = new Set(inFocus.map((e) => e.id));
      nextWords = inNext.filter((e) => !focusSet.has(e.id)).slice(0, 80).map((e) => e.bare);
    }
    const brief = levelBrief(knownB1);
    const frequent = strict
      ? []
      : await prisma.dictionaryEntry.findMany({ where: { b1Rank: { lt: FREE_RANK } }, select: { id: true } });
    const allowed = new Set([...familiar, ...upcoming.map((u) => u.id), ...frequent.map((f) => f.id)]);
    const target = practice ? PRACTICE_COVERAGE : lesson ? LESSON_COVERAGE : TARGET_COVERAGE;
    const attempts = practice ? 3 : lesson ? LESSON_ATTEMPTS : MAX_ATTEMPTS;
    const length = lessonLength(lessonWords);
    // Mots inconnus « hors niveau » : ni connus, ni du lexique en cours ou suivant.
    const tolerated = new Set([...allowed, ...stretch]);
    const measure = async (text: string) => {
      const cov = await bodyCoverage(text, allowed);
      const hard = lesson ? (await bodyCoverage(text, tolerated)).unknown : [];
      return { cov, value: ratio(cov), hard };
    };

    const day = parisDay();
    // Un thème différent pour chaque texte : du jour (par date), d'entraînement (par nombre).
    const rank = practice
      ? await prisma.text.count({ where: { userId, source: "practice", id: { lt: textId } } })
      : await prisma.text.count({ where: { userId, forDay: day, source: { in: ["generated", "lesson"] }, id: { lt: textId } } });
    const theme = THEMES[([...day].reduce((a, c) => a + c.charCodeAt(0), 0) + rank * 5 + (practice ? 3 : 0)) % THEMES.length];
    const user = (
      lesson
        ? [
            `Thème : ${theme} (adapte librement le thème au vocabulaire disponible).`,
            `Longueur : environ ${length} mots. Grammaire : ${brief.grammar}.`,
            `But : un texte de LEÇON. 95 % des mots doivent être des mots que l'apprenant connaît (liste ci-dessous, toutes formes fléchies permises, plus les mots-outils et des prénoms). Les 5 % restants, soit environ ${Math.round(length * (1 - LESSON_COVERAGE))} mots, sont des mots nouveaux, à prendre dans la liste des mots à apprendre, dans un contexte qui aide à deviner leur sens.`,
            `Mots à apprendre (lexique en cours, à préférer) : ${focusWords.map((w) => (w.gloss ? `${w.bare} (${w.gloss})` : w.bare)).join(", ")}.`,
            nextWords.length ? `Si besoin, mots du niveau suivant : ${nextWords.join(", ")}.` : "",
            "Aucun autre mot plein. S'il manque un mot pour une idée, change d'idée ou fais une phrase plus simple : le texte doit rester naturel et logique.",
            `Mots que l'apprenant connaît : ${mine.map((w) => w.entry.bare).join(", ")}.`,
            "Les questions et les options n'emploient que des mots connus.",
          ]
        : practice
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
              upcoming.length
                ? `Mots nouveaux à introduire si (et seulement si) ils s'intègrent naturellement dans l'histoire, dans un contexte qui aide à deviner le sens : ${upcoming
                    .map((u) => `${u.bare} (${u.glossFr ?? "?"})`)
                    .join(", ")}.`
                : "",
              "Les questions et les options n'emploient aussi que ce vocabulaire.",
            ]
    ).join("\n");

    // On garde le meilleur essai ; on s'arrête dès que la couverture visée est atteinte.
    let best: { out: Generated; questions: ComprehensionQuestion[]; coverage: number; hard: number } | null = null;
    let prompt = user;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const out = (await generateReadingText(SYSTEM, prompt)) as Generated;
      const questions = validQuestions(out.questions);
      if (!out.text || !/[а-яё]/i.test(out.text) || questions.length < 3) continue;
      const { cov, value, hard } = await measure(out.text);
      console.log(`[texts] ${textId} essai ${attempt + 1} : couverture ${Math.round(value * 100)} %${lesson ? `, ${hard.length} hors niveau` : ""}`);
      // Meilleur essai : d'abord la couverture visée, puis le moins de mots hors niveau, puis la couverture.
      const score = (c: number, h: number) => (c >= target ? 0 : 1000) + h * 5 - c;
      if (!best || score(value, hard.length) < score(best.coverage, best.hard))
        best = { out, questions, coverage: value, hard: hard.length };
      if (value >= target && hard.length === 0) break;
      // Essai suivant : réviser CE texte en remplaçant précisément les mots en trop.
      prompt = [
        user,
        "",
        "Voici ta version précédente :",
        JSON.stringify({ title: out.title, text: out.text, questions: out.questions }),
        lesson
          ? `Ton texte a ${Math.round(value * 100)} % de mots connus : il en faut ${Math.round(target * 100)} %.${hard.length ? ` Ces mots ne sont ni connus ni à apprendre : ${hard.join(", ")}.` : ""} Remplace des mots inconnus par des mots connus (garde quelques mots à apprendre) ; des phrases plus courtes et plus simples sont bienvenues. Même format JSON.`
          : `Ces mots sont trop difficiles pour l'apprenant : ${cov.unknown.filter((w) => !upcoming.some((u) => u.bare === w)).join(", ")}.`,
        lesson
          ? ""
          : strict
            ? "Remplace chacun d'eux par un mot de la liste, ou réécris la phrase autrement avec les mots de la liste (ou supprime-la). Le texte doit rester naturel et logique. Même format JSON."
            : "Remplace ceux que tu peux par un mot plus simple ou courant, sans rendre une phrase bizarre : si un remplacement abîme le sens, garde le mot. Garde l'histoire, sa logique et le naturel. Même format JSON.",
      ].join("\n");
    }
    if (!best) throw new Error("Texte généré incomplet");
    // Correction ciblée (texte de leçon) : tant que la couverture visée n'est pas atteinte, on fait
    // réécrire seulement les phrases qui contiennent le plus de mots inconnus.
    if (lesson && (best.coverage < target || best.hard > 0)) {
      let text = best.out.text!;
      for (let pass = 0; pass < REPAIR_PASSES && (best.coverage < target || best.hard > 0); pass++) {
        const sentences = splitParagraphs(text).flatMap((p) => splitSentences(p));
        const scored = await Promise.all(
          sentences.map(async (sentence) => {
            const c = await bodyCoverage(sentence, allowed);
            const h = (await bodyCoverage(sentence, tolerated)).unknown;
            return { sentence, unknown: c.unknown, hard: h };
          }),
        );
        // Les phrases avec des mots hors niveau d'abord, puis celles qui ont le plus d'inconnus.
        const worst = scored
          .filter((x) => x.unknown.length > 0)
          .sort((a, b) => b.hard.length - a.hard.length || b.unknown.length - a.unknown.length)
          .slice(0, REPAIR_SENTENCES);
        if (worst.length === 0) break;
        const out = await chatJson<{ replacements?: { original?: string; rewritten?: string }[] }>(
          [
            {
              role: "system",
              content:
                "Tu corriges un texte de lecture russe pour un apprenant. On te donne des phrases et, pour chacune, les mots que l'apprenant ne connaît pas. Réécris CHAQUE phrase pour remplacer ces mots par des mots qu'il connaît (liste fournie) ou des mots-outils, en gardant le sens dans l'histoire, une phrase naturelle et correcte, SANS accents toniques. Réponds en JSON : {\"replacements\":[{\"original\":\"phrase d'origine, à l'identique\",\"rewritten\":\"nouvelle phrase\"}]}",
            },
            {
              role: "user",
              content: [
                `Mots que l'apprenant connaît : ${mine.map((w) => w.entry.bare).join(", ")}.`,
                "Phrases à réécrire :",
                ...worst.map((w, i) => `${i + 1}. ${w.sentence}\n   Mots inconnus : ${w.unknown.join(", ")}`),
              ].join("\n"),
            },
          ],
          { temperature: 0.3 },
        );
        let next = text;
        for (const r of out.replacements ?? [])
          if (r.original && r.rewritten && next.includes(r.original.trim())) next = next.replace(r.original.trim(), r.rewritten.trim());
        if (next === text) break;
        const { value, hard } = await measure(next);
        console.log(`[texts] ${textId} correction ${pass + 1} : couverture ${Math.round(value * 100)} %, ${hard.length} hors niveau`);
        // On garde la correction si elle améliore (sans ajouter de mots hors niveau).
        if (value > best.coverage && hard.length <= best.hard) {
          text = next;
          best = { ...best, out: { ...best.out, text }, coverage: value, hard: hard.length };
        } else break;
      }
    }
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
