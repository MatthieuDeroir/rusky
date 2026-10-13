// Marque les mots du lexique minimum A1 (ТЭУ, éd. Zlatoust, 780 unités) dans le dictionnaire :
// DictionaryEntry.inA1Minimum. Source : data/A1/lexique-a1-dokumen.html (copie de la page
// dokumen.pub, texte du livre en HTML). Seules les formes du dictionnaire (lemmes) sont retenues :
// les formes citées dans les articles (англичане, артисток) et les exemples ne correspondent à
// aucune entrée et tombent d'eux-mêmes. Simulation par défaut ; --apply pour écrire.
//   npx tsx --env-file=.env [--env-file=.env.production.local] --conditions=react-server scripts/import-a1.ts [--apply]
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";

const apply = process.argv.includes("--apply");
/** Pomètes et abréviations du dictionnaire (pas des mots). */
const NOTES = new Set(["нсв", "св", "см", "сущ", "только", "мн", "ед", "р", "ж", "м", "ср", "неизм", "кр", "сравн", "ст", "безл", "разг", "ум", "инф", "прош", "вр", "л", "не", "употр", "т", "д", "п", "ч", "ф", "ант", "син", "им", "тэу"]);

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

(async () => {
  let t = readFileSync("data/A1/lexique-a1-dokumen.html", "utf8");
  t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  t = t.replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "");
  // L'accent tonique est un caractère de contrôle (U+0003), le trait d'union un autre (U+0013).
  t = decode(t).replace(/\u0003/g, "").replace(/\u0013/g, "-");
  // Partie I (dictionnaire alphabétique) : entre son titre (encodage cassé « ËÅÊÑÈ… ») et la partie II.
  let body = t.slice(t.indexOf("ËÅÊÑÈ"), t.indexOf("×àñòü II"));
  body = body.replace(/Лексический минимум по русскому языку как иностранному/g, "").replace(/\([^)]*\)/g, " ");
  const tokens = new Set<string>();
  for (const w of body.toLowerCase().match(/(?<![-а-яё])[а-яё]+(?:-[а-яё]+)*/g) ?? []) {
    const n = w.replace(/ё/g, "е");
    // Lettres isolées : en-têtes de section (Б, Г…), sauf les vrais mots d'une lettre.
    if (n.length === 1 && !"авиксуоя".includes(n)) continue;
    if (!NOTES.has(n)) tokens.add(n);
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { bare: { in: [...tokens] } },
    select: { id: true, bare: true, type: true, b1Rank: true },
  });
  // Homographes : celui du lexique B1, sinon la partie du discours suggérée par la terminaison.
  const guess = (w: string) =>
    /(ть|ться|чь|ти)$/.test(w) ? "verb" : /(ый|ий|ой)$/.test(w) ? "adjective" : /о$/.test(w) ? "other" : "noun";
  const byBare = new Map<string, typeof entries>();
  for (const e of entries) byBare.set(e.bare, [...(byBare.get(e.bare) ?? []), e]);
  const ids: number[] = [];
  for (const [bare, list] of byBare)
    ids.push((list.find((e) => e.b1Rank !== null) ?? list.find((e) => e.type === guess(bare)) ?? list[0]).id);
  const inB1 = entries.filter((e) => ids.includes(e.id) && e.b1Rank !== null).length;
  console.log(`Mots lus : ${tokens.size} ; lemmes trouvés : ${ids.length} (dont ${inB1} du lexique B1)`);
  console.log(`Exemples : ${[...byBare.keys()].slice(0, 80).join(", ")}`);
  if (!apply) {
    console.log("\nSimulation : rien n'a été écrit (--apply pour marquer).");
    return;
  }
  await prisma.dictionaryEntry.updateMany({ where: { id: { in: ids } }, data: { inA1Minimum: true } });
  console.log(`${ids.length} entrées marquées A1.`);
})();
