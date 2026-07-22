// Server-side Mistral calls. Used to (1) grade TORFL production tasks and (2) recommend which
// exams the learner is ready to attempt. The API key lives in MISTRAL_API_KEY (.env) and is
// never exposed to the client. All calls degrade gracefully when the key is missing or the
// network fails — the UI then falls back to a neutral state.
// NB: only import this from server code (server components / "use server" actions).
import { prisma } from "@/lib/db";
import {
  LEVELS,
  findLevel,
  type GradeResult,
  type ProductionTask,
  type ExamItem,
  type Cefr,
  SKILL_LABEL,
  PASS_SCORE,
  targetDescription,
} from "./torfl";

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

function apiKey() {
  return process.env.MISTRAL_API_KEY?.trim() || null;
}
function model() {
  return process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest";
}

export function mistralConfigured() {
  return apiKey() !== null;
}

interface ChatMsg {
  role: "system" | "user";
  content: string;
}

async function chatJson<T>(messages: ChatMsg[], temperature = 0.2): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("MISTRAL_API_KEY manquante");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      temperature,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mistral ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as T;
}

// ---- Grading a production task ---------------------------------------------------

export async function gradeProduction(
  task: ProductionTask,
  response: string,
): Promise<GradeResult> {
  const sys =
    "Tu es un examinateur officiel du test de russe ТРКИ/TORFL. Tu évalues une production " +
    "d'apprenant (en russe) selon le niveau visé. Sois bienveillant mais rigoureux et calibré " +
    "sur le niveau. Réponds UNIQUEMENT en JSON valide, en français pour les commentaires.";

  const user = [
    `Niveau visé : ${targetDescription(task)} — ${SKILL_LABEL[task.skill]}.`,
    `Consigne donnée à l'apprenant : ${task.promptFr}`,
    task.minWords ? `Longueur attendue : au moins ${task.minWords} mots.` : "",
    "",
    "Réponse de l'apprenant (en russe) :",
    response,
    "",
    "Évalue et renvoie un objet JSON avec EXACTEMENT ces clés :",
    `{`,
    `  "score": entier 0-100 (adéquation au niveau ${task.cefr}),`,
    `  "pass": booléen (true si le niveau ${task.cefr} est atteint, seuil ~${PASS_SCORE}),`,
    `  "feedback": string (2-4 phrases de retour global en français),`,
    `  "criteria": [ { "name": string, "score": entier 0-5, "comment": string } ] (3 à 4 critères : ex. réalisation de la tâche, grammaire, lexique, cohérence),`,
    `  "corrected": string (une version corrigée/améliorée de la réponse en russe)`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatJson<Partial<GradeResult>>([
    { role: "system", content: sys },
    { role: "user", content: user },
  ]);
  return normalizeGrade(raw);
}

function normalizeGrade(raw: Partial<GradeResult>): GradeResult {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score ?? 0))));
  return {
    score,
    pass: typeof raw.pass === "boolean" ? raw.pass : score >= PASS_SCORE,
    feedback: String(raw.feedback ?? "").trim(),
    criteria: Array.isArray(raw.criteria)
      ? raw.criteria.slice(0, 6).map((c) => ({
          name: String(c?.name ?? ""),
          score: Math.max(0, Math.min(5, Math.round(Number(c?.score ?? 0)))),
          comment: String(c?.comment ?? ""),
        }))
      : [],
    corrected: raw.corrected ? String(raw.corrected) : undefined,
  };
}

// ---- Comprehension / translation items (generated on demand) ---------------------

const LEN: Record<Cefr, string> = {
  A1: "1 à 2 phrases très simples",
  A2: "3 à 4 phrases simples",
  B1: "un court paragraphe (~50 mots)",
  B2: "un paragraphe (~90 mots)",
  C1: "un texte (~140 mots)",
  C2: "un texte dense (~180 mots)",
};

// Coerce a possibly-misshaped LLM value into a plain string (the model sometimes returns an
// array/object instead of a string → would render as "[object Object]").
function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v))
    return v.map((x) => (typeof x === "string" ? x : asText(x))).join(" ").trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return asText(o.text ?? o.passage ?? o.source ?? o.ru ?? o.fr ?? Object.values(o));
  }
  return v == null ? "" : String(v);
}

/** Generated item + (for QCM) the hidden correct answers. */
export interface GeneratedItem {
  item: ExamItem;
  correct?: number[]; // grammaire: index of the right option per question
}

const QCM_COUNT: Record<Cefr, number> = { A1: 6, A2: 8, B1: 10, B2: 10, C1: 12, C2: 12 };

/** Generate the material for a generated subtest (grammaire / lecture / ecoute) at its level. */
export async function generateExamItem(task: ProductionTask): Promise<GeneratedItem> {
  const theme = findLevel(task.cefr)?.theme ?? "vie quotidienne";
  const sys =
    "Tu crées du matériel ORIGINAL pour le test de russe ТРКИ/TORFL, calibré sur le niveau " +
    "demandé. Invente un contenu nouveau à chaque fois. Réponds UNIQUEMENT en JSON valide.";

  if (task.skill === "grammaire") {
    const n = QCM_COUNT[task.cefr];
    const raw = await chatJson<{ items?: unknown }>(
      [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            `Niveau visé : ${targetDescription(task)}. Sous-épreuve : Лексика-Грамматика.`,
            `Génère ${n} questions à choix multiple ORIGINALES de lexique/grammaire russe,`,
            "adaptées au niveau : phrase russe avec un trou ou un choix, 4 options EN RUSSE,",
            "une seule correcte. JSON :",
            '{ "items": [ { "question": string (russe), "options": [4 strings russes], "correct": index 0-3 } ] }',
          ].join("\n"),
        },
      ],
      0.8,
    );
    const rows = Array.isArray(raw.items) ? raw.items : [];
    const mcq: { question: string; options: string[] }[] = [];
    const correct: number[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const question = asText(r?.question);
      const options = Array.isArray(r?.options) ? (r!.options as unknown[]).map(asText) : [];
      if (!question || options.length < 2) continue;
      let idx = Number(r?.correct);
      if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) idx = 0;
      mcq.push({ question, options });
      correct.push(idx);
    }
    return { item: { mcq }, correct };
  }

  // lecture / ecoute: a Russian passage + comprehension questions. A varied angle so the
  // reading and listening texts of the same level differ.
  const angles = [
    "une scène de la vie quotidienne",
    "un court dialogue",
    "un récit à la première personne",
    "une annonce ou un message",
    "une description de lieu ou de personne",
    "un échange d'opinions",
  ];
  const angle = angles[Math.floor(Math.random() * angles.length)];
  const raw = await chatJson<{ passage?: unknown; questions?: unknown }>(
    [
      { role: "system", content: sys },
      {
        role: "user",
        content: [
          `Niveau visé : ${targetDescription(task)}. Thème : « ${theme} ». Format : ${angle}.`,
          `Génère un texte ORIGINAL EN RUSSE (${LEN[task.cefr]}), naturel et adapté au niveau,`,
          "puis 3 questions de compréhension EN FRANÇAIS portant sur ce texte.",
          'JSON : { "passage": string (russe), "questions": [3 strings en français] }',
        ].join("\n"),
      },
    ],
    0.8,
  );
  return {
    item: {
      passage: asText(raw.passage),
      questions: Array.isArray(raw.questions)
        ? raw.questions.map(asText).filter(Boolean).slice(0, 4)
        : [],
    },
  };
}

/** Grade reading/listening comprehension answers against the generated passage. */
export async function gradeComprehension(
  task: ProductionTask,
  item: ExamItem,
  answers: string[],
): Promise<GradeResult> {
  const sys =
    "Tu es examinateur ТРКИ/TORFL. Évalue la compréhension d'un apprenant. Réponds UNIQUEMENT " +
    "en JSON, commentaires en français.";
  const qa = (item.questions ?? [])
    .map((q, i) => `Q${i + 1}: ${q}\nRéponse: ${answers[i] ?? "(vide)"}`)
    .join("\n");
  const user = [
    `Niveau visé : ${targetDescription(task)} — ${SKILL_LABEL[task.skill]}.`,
    "Texte (russe) :",
    item.passage ?? "",
    "",
    "Questions et réponses de l'apprenant :",
    qa,
    "",
    "Évalue la compréhension. JSON : {",
    `  "score": 0-100, "pass": booléen (seuil ~${PASS_SCORE}),`,
    '  "feedback": string (français), "criteria": [{"name","score":0-5,"comment"}],',
    '  "corrected": string (réponses attendues, en français)',
    "}",
  ].join("\n");
  return normalizeGrade(
    await chatJson<Partial<GradeResult>>([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]),
  );
}


// ---- Readiness recommendation (computed when opening the Validation tab) ----------

export interface LearnerProfile {
  totalWords: number;
  wordsByType: Record<string, number>;
  declensionForms: number;
  conjugationForms: number;
  passedLevels: string[];
}

export interface ExamRecommendation {
  available: boolean; // false when Mistral isn't configured/reachable
  message: string; // short French recommendation
  recommended: string[]; // CEFR level ids the learner is ready to attempt
}

// Cache the recommendation (per user, in the DB) so Mistral is only called when the
// learner's profile actually changed.
function profileSignature(p: LearnerProfile): string {
  return [
    p.totalWords,
    p.declensionForms,
    p.conjugationForms,
    [...p.passedLevels].sort().join(","),
  ].join("|");
}

export async function recommendExam(
  userId: string,
  profile: LearnerProfile,
): Promise<ExamRecommendation> {
  if (!mistralConfigured()) {
    return {
      available: false,
      message: "Configure MISTRAL_API_KEY pour obtenir une recommandation d'examens.",
      recommended: [],
    };
  }

  // Reuse the cached recommendation while the learner's profile is unchanged.
  const signature = profileSignature(profile);
  const cached = await prisma.recoCache.findUnique({ where: { userId } });
  if (cached?.signature === signature) {
    try {
      return JSON.parse(cached.reco) as ExamRecommendation;
    } catch {
      // fall through and regenerate
    }
  }

  const catalogue = LEVELS.map((l) => `${l.cefr} — ${l.title} : ${l.subtitle}`).join("\n");
  const sys =
    "Tu es un professeur de russe qui conseille un apprenant sur les niveaux ТРКИ/TORFL qu'il " +
    "peut raisonnablement tenter, d'après le vocabulaire et les formes grammaticales qu'il " +
    "maîtrise. Reste réaliste : ne recommande pas un niveau trop élevé. Réponds UNIQUEMENT en " +
    "JSON, message en français.";
  const user = [
    "Profil de l'apprenant :",
    `- Mots connus : ${profile.totalWords} (${Object.entries(profile.wordsByType)
      .map(([t, n]) => `${t}: ${n}`)
      .join(", ")})`,
    `- Formes de déclinaison remplies : ${profile.declensionForms}`,
    `- Formes de conjugaison remplies : ${profile.conjugationForms}`,
    `- Niveaux déjà validés : ${profile.passedLevels.join(", ") || "aucun"}`,
    "",
    "Niveaux disponibles :",
    catalogue,
    "",
    "Renvoie un JSON : {",
    '  "recommended": [ ids de niveaux (ex. "A1") à tenter maintenant, du plus accessible au plus ambitieux, max 3 ],',
    '  "message": "1-2 phrases en français expliquant ta recommandation"',
    "}",
  ].join("\n");

  try {
    const raw = await chatJson<{ recommended?: unknown; message?: unknown }>([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
    const valid = new Set<string>(LEVELS.map((l) => l.cefr));
    const recommended = Array.isArray(raw.recommended)
      ? raw.recommended.map(String).filter((id) => valid.has(id)).slice(0, 3)
      : [];
    const reco: ExamRecommendation = {
      available: true,
      message: String(raw.message ?? "").trim() || "Voici les examens que tu peux tenter.",
      recommended,
    };
    await prisma.recoCache
      .upsert({
        where: { userId },
        update: { signature, reco: JSON.stringify(reco) },
        create: { userId, signature, reco: JSON.stringify(reco) },
      })
      .catch(() => {});
    return reco;
  } catch (e) {
    return {
      available: false,
      message:
        "La recommandation n'a pas pu être générée (" +
        (e instanceof Error ? e.message : "erreur") +
        ").",
      recommended: [],
    };
  }
}
