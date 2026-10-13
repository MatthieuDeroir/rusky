// Import depuis l'ancienne app (Rusky v1–v3) vers Rusky B1.
//
// L'ancienne base n'est JAMAIS modifiée : elle n'est ouverte qu'en lecture (SELECT). La base cible
// est sauvegardée avant toute écriture si elle contient déjà des données.
//
//   npx tsx scripts/import-from-legacy.ts
//
// Source : LEGACY_URL / LEGACY_TOKEN (par défaut TURSO_DATABASE_URL / TURSO_AUTH_TOKEN de ../.env).
// Cible  : TARGET_URL / TARGET_TOKEN (par défaut la base locale prisma/dev.db).
//
// Idempotent : dictionnaire recopié seulement s'il manque des lignes, mots/textes insérés avec
// INSERT OR IGNORE (un mot déjà présent dans la cible — donc peut-être déjà révisé — n'est jamais
// écrasé).
import { readFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { createClient, type Client, type InStatement } from "@libsql/client";

const ROOT = join(__dirname, "..");
const legacyEnv = parse(readFileSync(join(ROOT, "..", ".env")));
const LEGACY_URL = process.env.LEGACY_URL ?? legacyEnv.TURSO_DATABASE_URL;
const LEGACY_TOKEN = process.env.LEGACY_TOKEN ?? legacyEnv.TURSO_AUTH_TOKEN;
const TARGET_URL = process.env.TARGET_URL ?? `file:${join(ROOT, "prisma/dev.db")}`;
const TARGET_TOKEN = process.env.TARGET_TOKEN;
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? legacyEnv.OWNER_EMAIL ?? "matthieu.deroir@gmail.com";

const DAY_MS = 24 * 60 * 60 * 1000;

function parisDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function count(c: Client, table: string): Promise<number> {
  const r = await c.execute(`select count(*) n from "${table}"`);
  return Number(r.rows[0].n);
}

/** Lit une table par pages (rowid croissant) — Turso limite la taille des réponses. */
async function* pages(c: Client, sql: string, size = 5000) {
  let last = 0;
  for (;;) {
    const r = await c.execute({ sql: `${sql} where rowid > ? order by rowid limit ?`, args: [last, size] });
    if (r.rows.length === 0) return;
    yield r.rows;
    last = Number(r.rows[r.rows.length - 1].rid);
    if (r.rows.length < size) return;
  }
}

async function writeBatches(c: Client, stmts: InStatement[], size = 500) {
  for (let i = 0; i < stmts.length; i += size) await c.batch(stmts.slice(i, i + size), "write");
}

function backupTarget() {
  if (!TARGET_URL.startsWith("file:")) {
    console.log("Cible distante : sauvegarde à faire avec scripts/backup-db.ts avant ce script.");
    return;
  }
  const path = TARGET_URL.slice("file:".length);
  if (!existsSync(path)) return;
  const dir = join(ROOT, "prisma/backups");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `dev-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  copyFileSync(path, dest);
  console.log(`Sauvegarde de la cible → ${dest}`);
}

// ---- Rang de fréquence ------------------------------------------------------------------
// Les CSV OpenRussian sont triés par fréquence d'usage. On convertit la position de chaque mot
// en percentile DANS son fichier, ce qui permet de mélanger noms, verbes, adjectifs… à fréquence
// comparable.
function frequencyPercentiles(): Map<string, number> {
  const files: [string, string][] = [
    ["nouns.csv", "noun"],
    ["verbs.csv", "verb"],
    ["adjectives.csv", "adjective"],
    ["others.csv", "other"],
  ];
  const out = new Map<string, number>();
  for (const [file, type] of files) {
    const lines = readFileSync(join(ROOT, "..", "data", file), "utf8").split("\n").slice(1).filter(Boolean);
    lines.forEach((line, i) => {
      // Les ~5 % de lignes finales ont été ajoutées hors classement (весь, лёгкий, хуже…) : pas de
      // rang fiable, on les laisse retomber sur la valeur par défaut de leur nature.
      if (i / lines.length > 0.95) return;
      const bare = line.split("\t")[0].replace(/ё/g, "е");
      const key = `${type}:${bare}`;
      if (!out.has(key)) out.set(key, i / lines.length);
      if (!out.has(`*:${bare}`)) out.set(`*:${bare}`, i / lines.length);
    });
  }
  return out;
}

async function main() {
  if (!LEGACY_URL) throw new Error("Source introuvable (TURSO_DATABASE_URL de ../.env)");
  const src = createClient({ url: LEGACY_URL, authToken: LEGACY_TOKEN });
  const dst = createClient({ url: TARGET_URL, authToken: TARGET_TOKEN });
  console.log(`Source : ${LEGACY_URL.replace(/\/\/([^.]+)\./, "//….")} (lecture seule)`);
  console.log(`Cible  : ${TARGET_URL}`);

  backupTarget();
  await dst.execute("PRAGMA foreign_keys = OFF");

  // ---- 1. Dictionnaire ----------------------------------------------------------------
  const [srcEntries, srcForms] = [await count(src, "DictionaryEntry"), await count(src, "DictionaryForm")];
  if ((await count(dst, "DictionaryEntry")) < srcEntries) {
    console.log(`Dictionnaire : ${srcEntries} entrées…`);
    for await (const rows of pages(
      src,
      `select rowid rid, id, bare, accented, type, gender, aspect, animate, indeclinable, sgOnly, plOnly,
              comparative, superlative, partner, translationsFr, translationsEn, inB1Minimum from DictionaryEntry`,
    )) {
      await writeBatches(
        dst,
        rows.map((r) => ({
          sql: `insert or ignore into DictionaryEntry (id, bare, accented, type, gender, aspect, animate, indeclinable,
                sgOnly, plOnly, comparative, superlative, partner, translationsFr, translationsEn, inB1Minimum)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            r.id, r.bare, r.accented, r.type, r.gender, r.aspect, r.animate, r.indeclinable, r.sgOnly, r.plOnly,
            r.comparative, r.superlative, r.partner, r.translationsFr, r.translationsEn, r.inB1Minimum,
          ],
        })),
      );
    }
  }
  if ((await count(dst, "DictionaryForm")) < srcForms) {
    console.log(`Formes : ${srcForms}…`);
    let done = 0;
    for await (const rows of pages(
      src,
      "select rowid rid, id, entryId, formKey, accented, bareForm, variantIndex from DictionaryForm",
    )) {
      await writeBatches(
        dst,
        rows.map((r) => ({
          sql: "insert or ignore into DictionaryForm (id, entryId, formKey, accented, bareForm, variantIndex) values (?,?,?,?,?,?)",
          args: [r.id, r.entryId, r.formKey, r.accented, r.bareForm, r.variantIndex],
        })),
        1000,
      );
      done += rows.length;
      if (done % 50000 < rows.length) console.log(`  … ${done}`);
    }
  }

  // ---- 2. Rang du parcours B1 (fréquence) ----------------------------------------------
  const freq = frequencyPercentiles();
  const b1 = await dst.execute("select id, bare, type from DictionaryEntry where inB1Minimum = 1");
  const knownFreqs = b1.rows
    .map((r) => freq.get(`${r.type}:${r.bare}`) ?? freq.get(`*:${r.bare}`))
    .filter((f): f is number => f !== undefined)
    .sort((a, b) => a - b);
  const median = knownFreqs[Math.floor(knownFreqs.length / 2)] ?? 0.01;
  // Absents des CSV de fréquence : pronoms/numéraux (mots-outils, appris en premier) et expressions
  // de plusieurs mots / ajouts tardifs (milieu de parcours).
  const ranked = b1.rows
    .map((r) => ({
      id: Number(r.id),
      bare: String(r.bare),
      f:
        freq.get(`${r.type}:${r.bare}`) ??
        freq.get(`*:${r.bare}`) ??
        (r.type === "pronoun" || r.type === "numeral" ? 0 : median),
    }))
    .sort((a, b) => a.f - b.f || a.id - b.id);
  // Homonymes (même bare) : le lexique B1 désigne UN sens — l'ancien import a marqué toutes les
  // entrées de même orthographe (мочь verbe ET nom « puissance »). On ne garde dans le parcours que
  // la plus fréquente ; les autres restent dans le dictionnaire, hors parcours (b1Rank null).
  // Quand un nom partage l'orthographe d'un adjectif / verbe / adverbe (белый, мочь, тут…), le nom
  // est un emploi substantivé ou un homonyme rare : on garde l'autre nature, au rang du plus fréquent.
  const typeOf = new Map(b1.rows.map((r) => [Number(r.id), String(r.type)]));
  const kept = new Map<string, number>();
  const firstPos = new Map<string, number>();
  ranked.forEach((w, i) => {
    if (!firstPos.has(w.bare)) firstPos.set(w.bare, i);
    const cur = kept.get(w.bare);
    if (cur === undefined || (typeOf.get(cur) === "noun" && typeOf.get(w.id) !== "noun")) kept.set(w.bare, w.id);
  });
  // Ordre du parcours = position du premier membre de la famille.
  const keptOrdered = [...kept.entries()].sort((a, b) => firstPos.get(a[0])! - firstPos.get(b[0])!);
  const rankStmts: InStatement[] = [{ sql: "update DictionaryEntry set b1Rank = null where b1Rank is not null", args: [] }];
  let rank = 0;
  for (const [, id] of keptOrdered) rankStmts.push({ sql: "update DictionaryEntry set b1Rank = ? where id = ?", args: [rank++, id] });
  await writeBatches(dst, rankStmts);
  console.log(`Parcours B1 : ${rank} mots ordonnés par fréquence (${ranked.length - rank} homonymes hors parcours).`);

  // ---- 3. Utilisateur + compte Google ---------------------------------------------------
  const u = await src.execute({ sql: "select id, name, email, emailVerified, image, createdAt from User where email = ?", args: [OWNER_EMAIL] });
  if (u.rows.length === 0) throw new Error(`Utilisateur ${OWNER_EMAIL} introuvable dans la source`);
  const user = u.rows[0];
  const userId = String(user.id);
  await dst.execute({
    sql: "insert or ignore into User (id, name, email, emailVerified, image, createdAt) values (?,?,?,?,?,?)",
    args: [user.id, user.name, user.email, user.emailVerified, user.image, user.createdAt],
  });
  const acc = await src.execute({ sql: "select * from Account where userId = ?", args: [userId] });
  for (const a of acc.rows) {
    await dst.execute({
      sql: `insert or ignore into Account (userId, type, provider, providerAccountId, refresh_token, access_token, expires_at,
            token_type, scope, id_token, session_state) values (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        a.userId, a.type, a.provider, a.providerAccountId, a.refresh_token ?? null, a.access_token ?? null,
        a.expires_at ?? null, a.token_type ?? null, a.scope ?? null, a.id_token ?? null, a.session_state ?? null,
      ],
    });
  }
  await dst.execute({ sql: "insert or ignore into Settings (userId, newPerDay) values (?, 23)", args: [userId] });

  // ---- 4. Mots : connus / en cours ------------------------------------------------------
  const attempts = await src.execute({
    sql: "select entryId, correct, createdAt from QuizAttempt where userId = ? and formKey = 'vocab:ru-fr' order by createdAt desc",
    args: [userId],
  });
  const lastVocab = new Map<number, boolean>();
  const firstSeen = new Map<number, string>();
  for (const a of attempts.rows) {
    const id = Number(a.entryId);
    if (!lastVocab.has(id)) lastVocab.set(id, Number(a.correct) === 1);
    firstSeen.set(id, String(a.createdAt)); // trié desc → la dernière valeur écrite est la plus ancienne
  }
  const enc = await src.execute({
    sql: "select entryId, source, context, createdAt from Encounter where userId = ? and entryId is not null order by createdAt asc",
    args: [userId],
  });
  const encInfo = new Map<number, { source: string | null; context: string | null; first: string }>();
  for (const e of enc.rows) {
    const id = Number(e.entryId);
    const prev = encInfo.get(id);
    encInfo.set(id, {
      first: prev?.first ?? String(e.createdAt),
      // garde la phrase la plus récente qui en a une
      context: (e.context as string | null) || prev?.context || null,
      source: (e.context ? (e.source as string | null) : prev?.source) ?? null,
    });
  }
  const fr = await src.execute({
    sql: "select entryId, ease, intervalDays, repetitions, lapses, dueAt, lastReviewedAt from FormReview where userId = ?",
    args: [userId],
  });
  const best = new Map<number, (typeof fr.rows)[number]>();
  for (const r of fr.rows) {
    const id = Number(r.entryId);
    const prev = best.get(id);
    if (!prev || Number(r.intervalDays) > Number(prev.intervalDays)) best.set(id, r);
  }

  const now = Date.now();
  const ids = new Set<number>([...lastVocab.keys(), ...encInfo.keys()]);
  const wordStmts: InStatement[] = [];
  let known = 0;
  let learning = 0;
  for (const id of ids) {
    const isKnown = lastVocab.get(id) === true;
    const s = best.get(id);
    const e = encInfo.get(id);
    const first = [e?.first, firstSeen.get(id)].filter(Boolean).sort()[0] ?? new Date(now).toISOString();
    // Étalement déterministe des échéances : pas 300 cartes dues le premier jour.
    const spread = (id * 2654435761) % 14;
    let interval = s ? Number(s.intervalDays) : 0;
    let reps = s ? Number(s.repetitions) : 0;
    let due: number;
    if (isKnown) {
      interval = Math.max(interval, 4);
      reps = Math.max(reps, 2);
      due = s?.dueAt ? Math.max(Date.parse(String(s.dueAt)), now + (spread % 7) * DAY_MS) : now + (1 + spread) * DAY_MS;
      known++;
    } else {
      due = now + (spread % 4) * DAY_MS;
      learning++;
    }
    wordStmts.push({
      sql: `insert or ignore into Word (userId, entryId, status, origin, ease, intervalDays, repetitions, lapses, dueAt,
            lastReviewedAt, firstSeenAt, knownAt, source, context) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        userId, id, isKnown ? "KNOWN" : "LEARNING", "legacy", s ? Number(s.ease) : 2.5, interval, reps,
        s ? Number(s.lapses) : 0, new Date(due).toISOString(), (s?.lastReviewedAt as string | null) ?? null,
        new Date(first).toISOString(),
        // Appris à la première rencontre : les tests de vocabulaire de l'ancienne app ne datent que
        // d'août, alors que les mots sont travaillés depuis juin (historique mensuel de Progrès).
        isKnown ? new Date(first).toISOString() : null,
        e?.source ?? null,
        e?.context ?? null,
      ],
    });
  }
  await writeBatches(dst, wordStmts);
  console.log(`Mots : ${known} connus, ${learning} en cours (source).`);

  // ---- 5. Historique d'activité (calendrier) ---------------------------------------------
  const hist = await src.execute({
    sql: "select createdAt from QuizAttempt where userId = ? union all select createdAt from Encounter where userId = ?",
    args: [userId, userId],
  });
  const perDay = new Map<string, number>();
  for (const r of hist.rows) {
    const d = parisDay(new Date(String(r.createdAt)));
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  await writeBatches(
    dst,
    [...perDay].map(([day, n]) => ({ sql: "insert or ignore into DayLog (userId, day, reviews) values (?,?,?)", args: [userId, day, n] })),
  );

  // ---- 6. Textes : corpus + textes collés ------------------------------------------------
  const texts = await src.execute({
    sql: `select title, body, source, userId, attribution, status, analysis, analysisVersion, difficulty, createdAt
          from ReadingText where source = 'corpus' or (source = 'pasted' and userId = ?)`,
    args: [userId],
  });
  const existing = await dst.execute("select source, title from Text");
  const seen = new Set(existing.rows.map((r) => `${r.source}|${r.title}`));
  let addedTexts = 0;
  for (const t of texts.rows) {
    if (seen.has(`${t.source}|${t.title}`)) continue;
    const ready = t.status === "READY" && t.analysis;
    await dst.execute({
      sql: `insert into Text (userId, source, title, body, level, attribution, status, analysis, analysisVersion, createdAt)
            values (?,?,?,?,?,?,?,?,?,?)`,
      args: [
        t.source === "corpus" ? null : userId, t.source, t.title, t.body, t.difficulty ?? null, t.attribution ?? null,
        ready ? "READY" : "PENDING", ready ? t.analysis : null, ready ? t.analysisVersion : null, t.createdAt,
      ],
    });
    addedTexts++;
  }

  // ---- Rapport ----------------------------------------------------------------------------
  const report = await dst.execute({
    sql: `select
      (select count(*) from DictionaryEntry) entries,
      (select count(*) from DictionaryForm) forms,
      (select count(*) from DictionaryEntry where b1Rank is not null) b1,
      (select count(*) from Word where userId = ? and status = 'KNOWN') known,
      (select count(*) from Word w join DictionaryEntry d on d.id = w.entryId where w.userId = ? and w.status = 'KNOWN' and d.b1Rank is not null) knownB1,
      (select count(*) from Word where userId = ? and status = 'LEARNING') learning,
      (select count(*) from Text) texts,
      (select count(*) from DayLog where userId = ?) days`,
    args: [userId, userId, userId, userId],
  });
  console.log(`\nTextes ajoutés : ${addedTexts}`);
  console.log("Cible après import :", report.rows[0]);
  console.log(`Attendu : ${srcEntries} entrées, ${srcForms} formes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
