// Marque les mots du lexique minimum B2 (ТРКИ-2, éd. Zlatoust, « около 5100 единиц ») dans le
// dictionnaire : DictionaryEntry.inB2Minimum. Source : data/B2/Лексический минимум В2.pdf (texte
// extrait par pdftotext). Simulation par défaut ; --apply pour écrire.
//   pdftotext -layout "data/B2/Лексический минимум В2.pdf" /tmp/b2.txt
//   npx tsx --env-file=.env [--env-file=.env.production.local] --conditions=react-server scripts/import-b2.ts /tmp/b2.txt [--apply]
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { normalizeBare } from "@/lib/grammar";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) throw new Error("Chemin du texte extrait manquant");

/** Pièces de la colonne russe qui ne sont pas des mots (pomètes du dictionnaire). */
const NOTES = new Set(["нсв", "св", "см", "сущ", "только", "мн", "ед", "р", "ж", "м", "ср", "неизм", "кр", "сравн", "ст", "безл", "разг", "ум", "инф", "прош", "вр", "л", "не", "употр", "и", "т", "д", "п", "в"]);

(async () => {
  const text = readFileSync(file, "utf8");
  // Le dictionnaire : de « Часть I » au premier « Часть II. Приложения » (les annexes sont des
  // listes thématiques déjà couvertes).
  const start = text.indexOf("Часть I. Лексический минимум (алфавитный словник)", text.indexOf("ПРЕДИСЛОВИЕ"));
  const end = text.indexOf("Часть II", start + 100);
  const heads = new Set<string>();
  for (const line of text.slice(start, end).split("\n")) {
    // Une entrée commence en colonne 0 par une lettre ; les lignes en retrait sont des exemples
    // ou des suites (les partenaires d'aspect ont leur propre entrée « см. »).
    if (!/^[а-яё]/i.test(line)) continue;
    const left = line.split(/\s{3,}/)[0].replace(/k/g, "").replace(/\([^)]*\)?/g, " ");
    for (const piece of left.split(/[;—,]/)) {
      const first = piece.trim().split(/\s+/)[0] ?? "";
      const word = first.replace(/[.:?!]+$/, "");
      if (!/^[а-яё][а-яё-]*$/i.test(word) || word.endsWith("-")) continue;
      if (NOTES.has(word.toLowerCase())) continue;
      heads.add(normalizeBare(word));
    }
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { bare: { in: [...heads] } },
    select: { id: true, bare: true, type: true, b1Rank: true },
  });
  // Un lemme peut avoir plusieurs entrées homographes : celle du lexique B1 si elle existe, sinon
  // la partie du discours que la terminaison suggère, sinon la première.
  const guess = (w: string) =>
    /(ть|ться|чь|ти)$/.test(w) ? "verb" : /(ый|ий|ой)$/.test(w) ? "adjective" : /о$/.test(w) ? "other" : "noun";
  const byBare = new Map<string, typeof entries>();
  for (const e of entries) byBare.set(e.bare, [...(byBare.get(e.bare) ?? []), e]);
  const ids: number[] = [];
  const missing: string[] = [];
  for (const h of heads) {
    const list = byBare.get(h);
    if (!list) {
      missing.push(h);
      continue;
    }
    const pick =
      list.find((e) => e.b1Rank !== null) ?? list.find((e) => e.type === guess(h)) ?? list[0];
    ids.push(pick.id);
  }
  const picked = new Set(ids);
  const b1 = entries.filter((e) => picked.has(e.id) && e.b1Rank !== null).length;
  console.log(`Entrées lues : ${heads.size} ; trouvées dans le dictionnaire : ${ids.length} (dont ${b1} du lexique B1) ; absentes : ${missing.length}`);
  console.log(`Absentes (extrait) : ${missing.slice(0, 60).join(", ")}`);
  if (!apply) {
    console.log("\nSimulation : rien n'a été écrit (--apply pour marquer).");
    return;
  }
  for (let i = 0; i < ids.length; i += 500)
    await prisma.dictionaryEntry.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { inB2Minimum: true } });
  console.log(`${ids.length} entrées marquées B2.`);
})();
