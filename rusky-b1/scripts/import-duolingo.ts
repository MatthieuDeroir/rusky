// Import des mots appris sur Duolingo (export « vocabulary.csv » : un mot ou une expression par
// ligne, du plus récent au plus ancien, sans date).
//   1. Le total des lignes est réparti à parts égales entre les mois (juin → octobre), dans
//      l'ordre d'apprentissage (le bas du fichier d'abord).
//   2. Chaque mot est ramené à son lexème (forme du dictionnaire) ; doublons retirés.
//   3. Les lexèmes déjà présents dans le parcours (B1 et hors B1) sont retirés.
//   4. Le reste entre comme CONNU (origine « duolingo »), daté dans son mois.
// Simulation par défaut ; --apply pour écrire. Base : celle des variables d'environnement
// (TURSO_* = prod), propriétaire = OWNER_EMAIL.
//   npx tsx --env-file=.env --env-file=.env.production.local --conditions=react-server \
//     scripts/import-duolingo.ts ~/Téléchargements/vocabulary.csv [--apply]
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { normalizeBare } from "@/lib/grammar";
import { lookupCandidates } from "@/lib/reader/analyze";

const MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
/** Dernier jour utilisable par mois (octobre : aujourd'hui). */
const LAST_DAY: Record<string, number> = { "2026-06": 30, "2026-07": 31, "2026-08": 31, "2026-09": 30, "2026-10": 13 };
const DAY_MS = 86_400_000;
/** Prénoms et noms propres des leçons Duolingo (Вера Ивановна, Юля…) : pas du vocabulaire. */
/** Lexème imposé quand l'entrée homographe est trompeuse dans le contexte Duolingo (« вина » :
 * du vin ; « лет » : génitif de год ; « извините » : du verbe извинить). */
const LEXEME: Record<string, string> = { извините: "извинить", простите: "простить", вина: "вино", лет: "год", будет: "быть" };
const NAMES = new Set(["вера", "ивановна", "иванович", "иван", "ваня", "юля", "юле", "юлия", "марк", "светлана", "чернов"]);

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) throw new Error("Chemin du fichier vocabulary.csv manquant");

(async () => {
  const owner = await prisma.user.findFirst({ where: { email: process.env.OWNER_EMAIL } });
  if (!owner) throw new Error("Propriétaire introuvable (OWNER_EMAIL)");
  const userId = owner.id;

  // Du plus ancien au plus récent.
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .reverse();
  const N = lines.length;
  const monthOf = (i: number) => MONTHS[Math.min(MONTHS.length - 1, Math.floor((i * MONTHS.length) / N))];

  // Mots de chaque ligne (une expression donne plusieurs mots), avec le mois de la ligne.
  const tokens: { norm: string; raw: string; month: string }[] = [];
  lines.forEach((l, i) => {
    for (const w of l.split(/\s+/)) {
      const raw = w.replace(/^[^а-яёА-ЯЁ]+|[^а-яёА-ЯЁ-]+$/g, "");
      if (/[а-яё]/i.test(raw) && !NAMES.has(normalizeBare(raw))) tokens.push({ norm: normalizeBare(raw), raw, month: monthOf(i) });
    }
  });
  const cands = await lookupCandidates([...new Set(tokens.map((t) => t.norm))]);
  const ids = [...new Set([...cands.values()].flat().map((c) => c.entryId))];
  const entries = new Map(
    (
      await prisma.dictionaryEntry.findMany({
        where: { id: { in: ids } },
        select: { id: true, b1Rank: true, type: true, translationsFr: true },
      })
    ).map((e) => [e.id, e]),
  );
  const ranks = new Map([...entries.values()].map((e) => [e.id, e.b1Rank]));

  // Lexème d'un mot :
  //  1. on écarte les entrées sans traduction française (« нас : génitif de мы », « двери » vide) ;
  //  2. forme d'un pronom du lexique B1 (нас, ей, его, она) → ce pronom (мы, он) ;
  //  3. le mot est lui-même une entrée (просто, хорошо, лев, банка) → elle, la plus fréquente
  //     du lexique B1 s'il y en a plusieurs (знать verbe, pas nom) ;
  //  4. sinon la lecture du lexique B1 la plus fréquente (сыра → сыр, лет → год), ou la première.
  const rankOf = (id: number) => ranks.get(id) ?? 100_000;
  const pick = (norm: string) => {
    const all = cands.get(norm) ?? [];
    const forced = LEXEME[norm] && all.find((c) => c.lemmaBare === LEXEME[norm]);
    if (forced) return forced;
    const list = all.filter((c) => entries.get(c.entryId)?.translationsFr);
    if (list.length === 0) return all[0] ?? null;
    const byRank = (xs: typeof list) => [...xs].sort((a, b) => rankOf(a.entryId) - rankOf(b.entryId))[0];
    const exact = list.filter((c) => c.lemmaBare === norm);
    const pronoun = list.find((c) => c.type === "pronoun" && c.lemmaBare !== norm && ranks.get(c.entryId) != null);
    if (pronoun && exact.every((c) => c.type === "other")) return pronoun;
    if (exact.length) return byRank(exact);
    return byRank(list);
  };

  const unmatched = new Set<string>();
  const lexemes = new Map<number, { month: string; lemma: string; b1: boolean }>();
  let dupes = 0;
  for (const t of tokens) {
    const c = pick(t.norm);
    if (!c) {
      unmatched.add(t.raw);
      continue;
    }
    if (lexemes.has(c.entryId)) {
      dupes++;
      continue; // le premier mois (le plus ancien) l'emporte
    }
    lexemes.set(c.entryId, { month: t.month, lemma: c.lemmaBare, b1: ranks.get(c.entryId) != null });
  }

  // Déjà dans le parcours, hors import Duolingo précédent (ré-exécutable : on resynchronise).
  const existing = new Set(
    (
      await prisma.word.findMany({
        where: { userId, entryId: { in: [...lexemes.keys()] }, origin: { not: "duolingo" } },
        select: { entryId: true },
      })
    ).map((w) => w.entryId),
  );
  const fresh = [...lexemes.entries()].filter(([id]) => !existing.has(id));

  console.log(`Lignes : ${N} (${Math.ceil(N / MONTHS.length)} par mois environ), mots : ${tokens.length}`);
  console.log(`Lexèmes distincts : ${lexemes.size} (${dupes} formes ou doublons regroupés), non reconnus : ${unmatched.size}`);
  console.log(`Déjà dans le parcours : ${existing.size} — à ajouter : ${fresh.length}`);
  for (const m of MONTHS) {
    const ofMonth = fresh.filter(([, v]) => v.month === m);
    console.log(`  ${m} : ${ofMonth.length} (dont ${ofMonth.filter(([, v]) => v.b1).length} du lexique B1)`);
  }
  if (unmatched.size) console.log(`Non reconnus : ${[...unmatched].join(", ")}`);
  console.log(`À ajouter : ${fresh.map(([, v]) => v.lemma + (v.b1 ? "*" : "")).join(", ")}  (* = lexique B1)`);

  if (!apply) {
    console.log("\nSimulation : rien n'a été écrit (--apply pour importer).");
    return;
  }
  const now = Date.now();
  const rows = MONTHS.flatMap((m) => {
    const ofMonth = fresh.filter(([, v]) => v.month === m);
    return ofMonth.map(([entryId], k) => {
      const day = 1 + Math.floor((k * LAST_DAY[m]) / ofMonth.length);
      const at = new Date(`${m}-${String(day).padStart(2, "0")}T10:00:00.000Z`);
      return {
        userId,
        entryId,
        status: "KNOWN",
        origin: "duolingo",
        repetitions: 2,
        intervalDays: 7,
        // Échéances étalées : pas des centaines de mots dus le même jour.
        dueAt: new Date(now + (1 + (entryId % 21)) * DAY_MS),
        firstSeenAt: at,
        knownAt: at,
        source: "Duolingo",
      };
    });
  });
  // Resynchronisation avec un import précédent : retire les mots mal résolus, ajoute les autres,
  // remet chaque mot à sa date.
  const previous = await prisma.word.findMany({ where: { userId, origin: "duolingo" }, select: { entryId: true } });
  const wanted = new Set(rows.map((r) => r.entryId));
  const stale = previous.map((w) => w.entryId).filter((id) => !wanted.has(id));
  const had = new Set(previous.map((w) => w.entryId));
  if (stale.length) await prisma.word.deleteMany({ where: { userId, origin: "duolingo", entryId: { in: stale } } });
  const added = await prisma.word.createMany({ data: rows.filter((r) => !had.has(r.entryId)) });
  for (const r of rows.filter((r) => had.has(r.entryId)))
    await prisma.word.update({
      where: { userId_entryId: { userId, entryId: r.entryId } },
      data: { knownAt: r.knownAt, firstSeenAt: r.firstSeenAt },
    });
  console.log(`\nImport : ${added.count} ajoutés, ${stale.length} retirés (mal résolus), ${rows.length - added.count} conservés.`);
})();
