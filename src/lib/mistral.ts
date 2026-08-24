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
import type { RaterFeedback } from "./exam/types";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chatJson<T>(messages: ChatMsg[], temperature = 0.2): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("MISTRAL_API_KEY manquante");
  // 429 (rate limit) est transitoire : on absorbe avec un backoff court plutôt que de faire
  // remonter l'échec directement — observé en prod, le générateur lexgram (concurrence + retries)
  // déclenche facilement le rate limit et perdait sinon une tentative entière pour ça.
  const BACKOFFS_MS = [600, 1800];
  for (let attempt = 0; ; attempt++) {
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
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "{}";
      return JSON.parse(content) as T;
    }
    const detail = await res.text().catch(() => "");
    if (res.status === 429 && attempt < BACKOFFS_MS.length) {
      await sleep(BACKOFFS_MS[attempt]);
      continue;
    }
    throw new Error(`Mistral ${res.status}: ${detail.slice(0, 200)}`);
  }
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


// ---- Lenient grading for Réviser (tolerate typos / close-enough answers) ---------

export type ToleranceKind = "recall" | "translate";

/** "exact" = à créditer pleinement ; "close" = l'idée y est mais le terme n'est pas juste
 * (crédit partiel, la carte revient plus tôt) ; "wrong" = refusé. */
export type ToleranceVerdict = "exact" | "close" | "wrong";

/** Catégorie du raté, pour que l'appli se souvienne du GENRE d'erreur (pas juste "faux") :
 * - "autre-mot" : un autre mot russe/français entièrement, sans lien de sens ni de forme.
 * - "autre-forme" : la bonne famille de sens mais la mauvaise nature grammaticale (un verbe
 *   pour un adjectif, une autre case/personne, etc.) — ex. гото́вый ↔ гото́вить.
 * - "oubli" : réponse qui n'a manifestement rien à voir (au hasard, ponctuation, lettres
 *   tapées pour passer au mot suivant sans savoir).
 */
export type MistakeKind = "autre-mot" | "autre-forme" | "oubli";

export interface ToleranceCheck {
  verdict: ToleranceVerdict;
  reason?: string; // courte explication en français, montrée sur un "close" ou un rejet
  mistakeKind?: MistakeKind; // seulement quand verdict === "wrong"
}

/** Une réponse sans une seule lettre (ponctuation seule, espaces) ne peut jamais être une
 * traduction ou une forme valide — inutile de payer un appel IA pour le savoir, et ça évite
 * qu'un modèle trop généreux ne laisse passer un "au hasard pour passer au mot suivant". */
function looksLikeGuess(answer: string): boolean {
  return !/\p{L}/u.test(answer);
}

/**
 * Second opinion on a wrong-looking practice answer: a typo/slip for a Russian recall (or a
 * fr→ru production), or a synonym/near-miss for a ru→fr translation. Only ever called as a
 * FALLBACK on a deterministic miss — never on an already correct answer — and degrades to
 * "wrong" (no behaviour change) when Mistral isn't configured or the call fails, so grading
 * never gets stricter or blocks on this.
 */
export async function checkAnswerTolerance(
  kind: ToleranceKind,
  expected: string[],
  answer: string,
): Promise<ToleranceCheck> {
  if (!mistralConfigured() || !answer.trim() || expected.length === 0) {
    return { verdict: "wrong" };
  }
  if (looksLikeGuess(answer)) {
    return { verdict: "wrong", mistakeKind: "oubli" };
  }
  const sys =
    kind === "recall"
      ? "Tu corriges un exercice de russe. On te donne la ou les formes russes attendues et la " +
        "réponse tapée par l'apprenant. Réponds \"exact\" si sa réponse est UNIQUEMENT une " +
        "faute de frappe mineure (lettre manquante, en trop, inversée, ou de clavier) d'une des " +
        "formes attendues, ÉCRITE EN RUSSE (alphabet cyrillique). Une réponse en alphabet " +
        "latin, une translittération phonétique du russe, ou toute chaîne qui n'est pas la " +
        "forme russe elle-même n'est JAMAIS \"exact\" — c'est \"wrong\". Réponds \"wrong\" pour " +
        "toute autre forme grammaticale (mauvais cas, mauvais nombre, mauvaise personne) ou un " +
        "autre mot : c'est justement ce que l'exercice teste. N'utilise pas \"close\" ici. En " +
        "cas de doute, \"wrong\". Pour un \"wrong\", classe aussi mistakeKind : \"autre-mot\" " +
        "(mot russe différent, sans lien), \"autre-forme\" (bonne racine/mot mais mauvaise case, " +
        "personne, temps ou nature), ou \"oubli\" (réponse qui n'a rien à voir, au hasard). " +
        "Réponds UNIQUEMENT en JSON."
      : "Tu corriges un exercice de traduction russe → français. On te donne la ou les " +
        "traductions attendues et la réponse de l'apprenant. Méfie-toi : l'apprenant tape " +
        "parfois n'importe quoi pour passer au mot suivant sans savoir — de la ponctuation, des " +
        "lettres au hasard, ou la RETRANSCRIPTION PHONÉTIQUE DU MOT RUSSE LUI-MÊME en alphabet " +
        "latin (ex. « iskat » pour « искать ») : ce n'est JAMAIS \"exact\" ni \"close\", " +
        "toujours \"wrong\" — ce n'est pas du français, encore moins une traduction. Trois " +
        "verdicts :\n" +
        "- \"exact\" : même sens (synonyme valide, reformulation équivalente, faute " +
        "d'orthographe ou d'accent mineure) — un VRAI mot français. N'invente JAMAIS " +
        "d'équivalence : si tu ne peux pas justifier que les deux mots sont réellement " +
        "synonymes en français courant, ce n'est pas \"exact\".\n" +
        "- \"close\" : l'apprenant a visiblement compris l'idée et propose un VRAI mot français " +
        "de sens voisin mais qui n'est pas le bon équivalent — nature grammaticale différente " +
        "(adjectif au lieu d'une préposition), terme trop vague, registre ou nuance à côté. Ex. " +
        "« proche » pour « près de / auprès de » : l'idée est là, le mot n'est pas la bonne " +
        "préposition.\n" +
        "- \"wrong\" : sens différent, hors sujet, ou pas un mot français reconnaissable.\n" +
        "Pour un \"wrong\", classe aussi mistakeKind : \"autre-mot\" (mot français sans lien de " +
        "sens avec l'attendu), \"autre-forme\" (même famille de sens/racine russe mais mauvaise " +
        "nature grammaticale, ex. un verbe traduit à la place d'un adjectif de la même racine), " +
        "ou \"oubli\" (réponse qui n'a manifestement rien à voir : au hasard, translittération " +
        "du russe, charabia).\n" +
        "Réponds UNIQUEMENT en JSON.";
  const user = [
    `Attendu : ${expected.join(" / ")}`,
    `Réponse de l'apprenant : ${answer}`,
    `JSON : { "verdict": "exact" | "close" | "wrong", "reason": string très courte en français (max 12 mots), "mistakeKind": "autre-mot" | "autre-forme" | "oubli" (uniquement si verdict "wrong") }`,
  ].join("\n");

  try {
    const raw = await chatJson<{ verdict?: unknown; reason?: unknown; mistakeKind?: unknown }>(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      0,
    );
    const v = String(raw.verdict ?? "").toLowerCase();
    const verdict: ToleranceVerdict =
      v === "exact" ? "exact" : v === "close" && kind === "translate" ? "close" : "wrong";
    const mk = String(raw.mistakeKind ?? "");
    const mistakeKind: MistakeKind | undefined =
      verdict === "wrong" && (mk === "autre-mot" || mk === "autre-forme" || mk === "oubli")
        ? (mk as MistakeKind)
        : undefined;
    return { verdict, reason: raw.reason ? String(raw.reason) : undefined, mistakeKind };
  } catch {
    return { verdict: "wrong" };
  }
}

// ---- Repairing the French gloss against the (reliable) English one ---------------

export interface FrenchGlossFix {
  fr: string | null; // corrected/filled FR senses, comma-separated; null = leave as is
  changed: boolean;
}

const TYPE_FR: Record<string, string> = {
  noun: "nom",
  verb: "verbe",
  adjective: "adjectif",
  pronoun: "pronom",
  numeral: "numéral",
  other: "invariable (adverbe, préposition, conjonction…)",
};

/**
 * Fill or repair an entry's French gloss, using the OpenRussian English gloss as the source of
 * truth (WikDict's FR is patchy and sometimes plain wrong — e.g. добро → « foutre » instead of
 * « bien »). Called lazily at question time, once per entry.
 *
 * Degrades to "no change" whenever Mistral is unavailable or the answer is unusable, so a bad
 * network never damages the dictionary.
 */
export async function repairFrenchGloss(input: {
  accented: string;
  type: string;
  en: string | null;
  fr: string | null;
}): Promise<FrenchGlossFix> {
  // Without an English reference there is nothing reliable to check against.
  if (!mistralConfigured() || !input.en?.trim()) return { fr: null, changed: false };

  const sys =
    "Tu es lexicographe russe→français. On te donne un mot russe, sa NATURE grammaticale, sa " +
    "traduction ANGLAISE (fiable, fait référence) et sa traduction FRANÇAISE actuelle (souvent " +
    "incomplète ou erronée). Produis la traduction française correcte : 1 à 4 sens, du plus " +
    "courant au plus rare, séparés par des virgules.\n" +
    "Règles impératives :\n" +
    "- La nature doit correspondre : un NOM se traduit par un nom (пилот = « pilote », jamais " +
    "« piloter »), un VERBE par un infinitif, un ADJECTIF par un adjectif, un ADVERBE par un " +
    "adverbe. C'est l'erreur la plus fréquente de la source à corriger.\n" +
    "- Reste fidèle au sens anglais de référence.\n" +
    "- Mots français usuels : pas d'argot ni de vulgarité, sauf si le mot russe est lui-même " +
    "vulgaire (добро = « bien, biens », jamais « foutre »).\n" +
    "- Juste les sens : pas d'article, pas de parenthèse, pas d'explication.\n" +
    "Réponds UNIQUEMENT en JSON.";
  const user = [
    `Mot russe : ${input.accented}`,
    `Nature : ${TYPE_FR[input.type] ?? input.type}`,
    `Traduction anglaise (référence) : ${input.en}`,
    `Traduction française actuelle : ${input.fr?.trim() || "(aucune)"}`,
    'JSON : { "fr": "sens1, sens2, …" }',
  ].join("\n");

  try {
    const raw = await chatJson<{ fr?: unknown }>(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      0,
    );
    const fr = asText(raw.fr)
      .replace(/\s*;\s*/g, ", ")
      .replace(/\s*,\s*/g, ", ")
      .trim();
    // Guard against a degenerate answer that would wreck a usable existing gloss.
    if (!fr || fr.length > 200) return { fr: null, changed: false };
    return { fr, changed: fr !== (input.fr ?? "").trim() };
  } catch {
    return { fr: null, changed: false };
  }
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

// ---- Objectif B1 : examen blanc ТРКИ-1 (lexgram) --------------------------------
// Un appel = un item (jamais un lot), conformément au principe du module — voir
// /home/mderoir/.claude/plans/robust-yawning-plum.md. Le few-shot est injecté dans le texte du
// message user (ChatMsg n'a pas de rôle assistant, volontairement non modifié pour rester
// compatible avec gradeProduction/recommendExam ci-dessus).

/** Génère un item lexgram brut (non validé) à partir d'un prompt déjà construit. */
export async function generateLexgramItem(systemPrompt: string, userPrompt: string): Promise<unknown> {
  return chatJson<unknown>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.85,
  );
}

/** Passe 6 (contre-résolution) : redemande la réponse sans la clé, température 0. */
export async function solveLexgramItem(stem: string, options: string[]): Promise<unknown> {
  const sys =
    "You are solving a Russian-as-a-foreign-language multiple-choice item (TORFL-1, B1). " +
    'Output ONLY valid JSON: {"correctIndex": number} — the index (0-based) of the single option ' +
    "that correctly fills the blank (___) in the sentence.";
  const user = `Sentence: ${stem}\nOptions:\n${options.map((o, i) => `${i}: ${o}`).join("\n")}`;
  return chatJson<unknown>(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    0,
  );
}

// ---- Objectif B1 : examen blanc ТРКИ-1 (speaking, M2) ---------------------------

/** Génère un item speaking brut (non validé) à partir d'un prompt déjà construit — même
 * principe qu'un item lexgram (un appel = un item). */
export async function generateSpeakingItem(systemPrompt: string, userPrompt: string): Promise<unknown> {
  return chatJson<unknown>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.85,
  );
}

/** Note le transcript ASR d'une réponse orale (§7.3 du spec) — même grille que письмo (M4) plus
 * `fluency` estimée depuis les marqueurs temporels de l'ASR (débit, silence). Le transcript
 * peut contenir des artefacts de reconnaissance vocale : le rater est explicitement instruit
 * d'être tolérant dessus et de se concentrer sur la grammaire/le lexique/la réalisation de la
 * tâche du candidat, pas la fidélité de la transcription. */
export async function gradeSpeaking(
  payload: { instructions: string; supportText?: string; stimuli?: string[] },
  transcript: string,
  fluency: { durationSec: number; wordCount: number },
): Promise<RaterFeedback> {
  const sys =
    "Tu es un examinateur officiel du test de russe ТРКИ-1. Tu évalues la transcription d'une " +
    "réponse ORALE — tolère les artefacts probables de reconnaissance vocale (mots mal transcrits, " +
    "ponctuation absente) et concentre-toi sur la grammaire, le lexique et la réalisation de la " +
    "tâche du candidat. Réponds UNIQUEMENT en JSON valide, commentaires en français.";

  const wpm = fluency.durationSec > 0 ? Math.round((fluency.wordCount / fluency.durationSec) * 60) : 0;
  const user = [
    `Consigne donnée au candidat : ${payload.instructions}`,
    payload.supportText ? `Texte support fourni :\n${payload.supportText}` : "",
    payload.stimuli?.length
      ? `Répliques/situations proposées :\n${payload.stimuli.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "",
    "",
    "Transcription de la réponse orale du candidat :",
    transcript.trim() || "(aucune réponse détectée par la reconnaissance vocale)",
    "",
    `Débit approximatif : ${wpm} mots/minute (${fluency.wordCount} mots en ${fluency.durationSec}s).`,
    "",
    "Évalue et renvoie un objet JSON avec EXACTEMENT ces clés :",
    `{ "scores": { "realisation": entier 0-5, "grammar": entier 0-5, "lexis": entier 0-5, "fluency": entier 0-5, "coherence": entier 0-5 },`,
    `  "errors": [ { "span": string (extrait fautif), "type": string, "correction": string, "explanationFr": string } ] (0 à 6 erreurs les plus significatives),`,
    `  "comment": string (2-3 phrases de retour global en français) }`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatJson<Partial<RaterFeedback>>([
    { role: "system", content: sys },
    { role: "user", content: user },
  ]);
  return normalizeRaterFeedback(raw);
}

function normalizeRaterFeedback(raw: Partial<RaterFeedback>): RaterFeedback {
  const scores: Record<string, number> = {};
  if (raw.scores && typeof raw.scores === "object") {
    for (const [k, v] of Object.entries(raw.scores)) {
      scores[k] = Math.max(0, Math.min(5, Math.round(Number(v ?? 0))));
    }
  }
  return {
    scores,
    errors: Array.isArray(raw.errors)
      ? raw.errors.slice(0, 10).map((e) => ({
          span: String(e?.span ?? ""),
          type: String(e?.type ?? ""),
          correction: String(e?.correction ?? ""),
          explanationFr: String(e?.explanationFr ?? ""),
        }))
      : [],
    comment: raw.comment ? String(raw.comment) : undefined,
  };
}
