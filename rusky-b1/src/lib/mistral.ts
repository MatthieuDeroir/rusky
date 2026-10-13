// Appels Mistral côté serveur (JSON mode). La clé reste dans MISTRAL_API_KEY, jamais exposée.
// Tous les appels passent par une file (2 en vol max par instance) : le quota de mistral-large
// est serré et une séance peut lancer plusieurs générations d'un coup.

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

export interface ChatMsg {
  role: "system" | "user";
  content: string;
}

export function mistralConfigured() {
  return !!process.env.MISTRAL_API_KEY?.trim();
}

/** Modèle du lecteur, des textes et des cartes : le plus solide par défaut. */
export function strongModel() {
  return process.env.MISTRAL_READER_MODEL?.trim() || "mistral-large-latest";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatJson<T>(
  messages: ChatMsg[],
  { temperature = 0.2, model = strongModel(), backoffsMs = [2000, 5000, 12000, 25000] } = {},
): Promise<T> {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) throw new Error("MISTRAL_API_KEY manquante");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature, response_format: { type: "json_object" }, messages }),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as T;
    }
    const detail = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt < backoffsMs.length) {
      await sleep(backoffsMs[attempt]);
      continue;
    }
    throw new Error(`Mistral ${res.status}: ${detail.slice(0, 200)}`);
  }
}

const MAX_IN_FLIGHT = 2;
let inFlight = 0;
const waiting: (() => void)[] = [];

/** chatJson derrière la file partagée. */
export async function queuedChat<T>(
  system: string,
  user: string,
  temperature: number,
): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await chatJson<T>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature },
    );
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

/** Analyse brute (non validée) d'un morceau de texte pour le lecteur. */
export function analyzeReadingChunk(system: string, user: string): Promise<unknown> {
  return queuedChat<unknown>(system, user, 0.1);
}

/** Génère un texte (JSON) à partir d'un prompt déjà construit. */
export function generateReadingText(system: string, user: string): Promise<unknown> {
  return queuedChat<unknown>(system, user, 0.8);
}
