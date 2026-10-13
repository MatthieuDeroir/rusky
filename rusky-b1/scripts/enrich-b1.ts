// Cartes vérifiées pour le parcours B1 : pour chaque mot, un sens français court et juste
// (l'ancien dictionnaire contient des erreurs, ex. постараться = « dégustation ») et une phrase
// d'exemple simple qui emploie le mot. Ne touche qu'aux colonnes glossFr / exampleRu / exampleFr.
//
//   npx tsx scripts/enrich-b1.ts            # mots pas encore enrichis, dans l'ordre du parcours
//   npx tsx scripts/enrich-b1.ts --limit 100
//
// Cible : TARGET_URL / TARGET_TOKEN (défaut : TURSO_* puis prisma/dev.db).
import "dotenv/config";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { queuedChat } from "../src/lib/mistral";

const ROOT = join(__dirname, "..");
const URL =
  process.env.TARGET_URL ?? process.env.TURSO_DATABASE_URL ?? `file:${join(ROOT, "prisma/dev.db")}`;
const TOKEN = process.env.TARGET_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
const BATCH = 25;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const SYSTEM = `Tu es lexicographe russe-français et enseignant de russe langue étrangère (niveau A2–B1).
Pour chaque mot russe fourni, rends :
- "gloss" : le ou les sens français COURANTS, du plus fréquent au moins fréquent, 1 à 3 sens, 45 caractères maximum, séparés par « , ». Corrige les traductions fournies si elles sont fausses ou rares. Pour un verbe : infinitif français. Pas d'article pour les noms.
- "ru" : une phrase d'exemple naturelle de 4 à 9 mots, vocabulaire simple (A2), qui contient le mot (n'importe quelle forme fléchie). Pas d'accents toniques, pas de guillemets.
- "fr" : la traduction française naturelle de la phrase.
Réponds en JSON : {"items":[{"id":<id>,"gloss":"…","ru":"…","fr":"…"}]} avec exactement un item par mot, mêmes id.`;

interface Item {
  id: number;
  gloss?: string;
  ru?: string;
  fr?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[́']/g, "");

async function main() {
  const db = createClient({ url: URL, authToken: TOKEN });
  const rows = (
    await db.execute(
      `select id, accented, type, aspect, translationsFr, translationsEn from DictionaryEntry
       where b1Rank is not null and glossFr is null order by b1Rank`,
    )
  ).rows.slice(0, LIMIT);
  console.log(`${rows.length} mots à enrichir (${URL.startsWith("file:") ? "locale" : "distante"}).`);

  // Formes connues de chaque mot, pour vérifier que l'exemple emploie bien le mot.
  async function formsOf(ids: number[]): Promise<Map<number, Set<string>>> {
    const r = await db.execute(`select entryId, bareForm from DictionaryForm where entryId in (${ids.join(",")})`);
    const m = new Map<number, Set<string>>();
    for (const f of r.rows) {
      const id = Number(f.entryId);
      if (!m.has(id)) m.set(id, new Set());
      m.get(id)!.add(norm(String(f.bareForm)));
    }
    return m;
  }

  let done = 0;
  let unverified = 0;
  const batches: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));

  async function run(batch: typeof rows) {
    const input = batch.map((r) => ({
      id: Number(r.id),
      mot: String(r.accented).replace(/'/g, "́"),
      nature: r.type,
      aspect: r.aspect ?? undefined,
      fr: String(r.translationsFr ?? "").slice(0, 120),
      en: String(r.translationsEn ?? "").slice(0, 120),
    }));
    let out: { items?: Item[] } = {};
    for (let attempt = 0; attempt < 2 && !out.items?.length; attempt++) {
      try {
        const raw = await queuedChat<unknown>(SYSTEM, JSON.stringify(input), 0.3);
        // Parfois une liste de blocs {items:[…]} au lieu d'un seul bloc : on aplatit.
        out = Array.isArray(raw)
          ? { items: raw.flatMap((x) => (x && typeof x === "object" && "items" in x ? (x as { items: Item[] }).items : [x as Item])) }
          : (raw as { items?: Item[] });
      } catch (e) {
        console.warn(`  lot ${input[0].id} : ${(e as Error).message}`);
      }
    }
    const forms = await formsOf(input.map((i) => i.id));
    const stmts = [];
    if (!out.items?.length) console.warn(`  lot ${input[0].id} : réponse vide`, JSON.stringify(out).slice(0, 200));
    for (const raw of out.items ?? []) {
      const it = { ...raw, id: Number(raw.id) };
      const src = batch.find((r) => Number(r.id) === it.id);
      if (!src || typeof it.gloss !== "string" || !it.gloss.trim()) continue;
      const own = forms.get(it.id) ?? new Set([norm(String(src.accented))]);
      own.add(norm(String(src.accented)));
      const tokens = norm(it.ru ?? "").split(/[^а-я-]+/).filter(Boolean);
      const ok = !!it.ru && (tokens.some((t) => own.has(t)) || String(src.accented).includes(" "));
      if (!ok) unverified++;
      stmts.push({
        sql: "update DictionaryEntry set glossFr = ?, exampleRu = ?, exampleFr = ? where id = ?",
        // Exemple gardé seulement s'il emploie vraiment le mot.
        args: [it.gloss.trim().slice(0, 60), ok ? it.ru!.trim() : null, ok ? it.fr?.trim() ?? null : null, it.id],
      });
    }
    if (stmts.length) await db.batch(stmts, "write");
    done += stmts.length;
    console.log(`  ${done}/${rows.length}`);
  }

  // 2 lots en parallèle (la file de mistral.ts plafonne de toute façon à 2).
  let next = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (next < batches.length) await run(batches[next++]);
    }),
  );
  console.log(`Terminé : ${done} mots enrichis, ${unverified} exemples rejetés (mot absent de la phrase).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
