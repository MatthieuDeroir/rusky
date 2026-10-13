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
      if (/[а-яё]/i.test(raw)) tokens.push({ norm: normalizeBare(raw), raw, month: monthOf(i) });
    }
  });
  const cands = await lookupCandidates([...new Set(tokens.map((t) => t.norm))]);
  const ids = [...new Set([...cands.values()].flat().map((c) => c.entryId))];
  const ranks = new Map(
    (await prisma.dictionaryEntry.findMany({ where: { id: { in: ids } }, select: { id: true, b1Rank: true } })).map((e) => [e.id, e.b1Rank]),
  );

  // Lexème : d'abord une lecture du lexique B1 (la plus fréquente : нас → мы, двери → дверь),
  // sinon la forme du dictionnaire si le mot l'est déjà, sinon la première lecture.
  const pick = (norm: string) => {
    const list = cands.get(norm) ?? [];
    if (list.length === 0) return null;
    const score = (c: (typeof list)[number]) => {
      const rank = ranks.get(c.entryId);
      return rank != null ? rank : 100_000 + (c.lemmaBare === norm ? 0 : 1);
    };
    return [...list].sort((a, b) => score(a) - score(b))[0];
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

  const existing = new Set(
    (await prisma.word.findMany({ where: { userId, entryId: { in: [...lexemes.keys()] } }, select: { entryId: true } })).map((w) => w.entryId),
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
  const res = await prisma.word.createMany({ data: rows });
  console.log(`\n${res.count} mots importés.`);
})();
