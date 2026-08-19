// Server-side DeepL calls. Used as a cheap SECOND source of French translations, merged into
// DictionaryEntry.translationsFr once per word (cached via `deeplChecked`) to widen the set of
// answers accepted at grading time without a live AI call. The API key lives in DEEPL_API_KEY
// (.env) and is never exposed to the client. Degrades silently when unconfigured or on failure.
// NB: only import this from server code (server components / "use server" actions).

function apiKey() {
  return process.env.DEEPL_API_KEY?.trim() || null;
}

export function deeplConfigured() {
  return apiKey() !== null;
}

// A free-tier key (suffix ":fx") lives on api-free.deepl.com; a paid key lives on api.deepl.com.
function endpoint(key: string) {
  return key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

/** Translate a single Russian word/phrase to French. Returns null on any failure (unconfigured,
 * network, rate limit) — callers must treat this as "no extra candidate", never fatal. */
export async function translateRuToFr(text: string): Promise<string | null> {
  const key = apiKey();
  if (!key || !text.trim()) return null;
  try {
    const res = await fetch(endpoint(key), {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: "RU",
        target_lang: "FR",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translations?: { text?: string }[] };
    return data.translations?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}
