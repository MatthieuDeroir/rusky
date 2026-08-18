// One-off: merge the local dev.db user data into Turso, so local and the deployed app share
// one dataset. Local rows belong to the dev-bypass user ("dev-local"); they are re-attributed
// to the real Google account. Nothing is ever deleted on either side.
//
//   npx tsx scripts/merge-local-into-turso.ts            # dry run (default)
//   npx tsx scripts/merge-local-into-turso.ts --apply    # actually write
//
// Reads Turso credentials from the env file given by TURSO_ENV (default .env.local).
import { createClient, type Client, type InValue } from "@libsql/client";
import Database from "better-sqlite3";
import { config } from "dotenv";

config({ path: process.env.TURSO_ENV ?? ".env.local" });

const APPLY = process.argv.includes("--apply");
const LOCAL_USER = "dev-local";

function log(...a: unknown[]) {
  console.log(...a);
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL manquant");
  const turso = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  const local = new Database("prisma/dev.db", { readonly: true });

  // The destination account: the single real user on Turso.
  const users = await turso.execute("select id, email from User");
  if (users.rows.length !== 1) {
    throw new Error(`Attendu 1 utilisateur sur Turso, trouvé ${users.rows.length}`);
  }
  const targetUser = String(users.rows[0].id);
  log(`Cible : ${users.rows[0].email} (${targetUser})`);
  log(APPLY ? "\n>>> MODE ÉCRITURE <<<\n" : "\n>>> SIMULATION (ajoute --apply pour écrire) <<<\n");

  await mergeEncounters(turso, local, targetUser);
  await mergeQuizAttempts(turso, local, targetUser);
  await mergeFormReviews(turso, local, targetUser);
  await mergeXpEvents(turso, local, targetUser);
  await mergeSimple(turso, local, targetUser, "Achievement", ["achievementId"]);
  await mergeSimple(turso, local, targetUser, "LevelProgress", ["track"], "level");
  await mergeSimple(turso, local, targetUser, "TorflProgress", ["taskId"]);
  await recomputeUserStats(turso, targetUser);

  local.close();
  log(APPLY ? "\n✓ Fusion terminée." : "\n(simulation — rien n'a été écrit)");
}

/** Encounters: identity = (entryId, matchedFormKey, rawInput, createdAt). Ids are NOT reused —
 * Turso assigns fresh ones — so local/prod id collisions are impossible. */
async function mergeEncounters(turso: Client, local: Database.Database, user: string) {
  const remote = await turso.execute("select entryId, matchedFormKey, rawInput, createdAt from Encounter");
  const seen = new Set(remote.rows.map((r) => key(r.entryId, r.matchedFormKey, r.rawInput, r.createdAt)));
  const rows = local
    .prepare("select entryId, rawInput, matchedFormKey, source, context, createdAt from Encounter where userId = ?")
    .all(LOCAL_USER) as Record<string, unknown>[];
  const missing = rows.filter((r) => !seen.has(key(r.entryId, r.matchedFormKey, r.rawInput, r.createdAt)));
  log(`Encounter      : ${remote.rows.length} distants, ${rows.length} locaux → ${missing.length} à ajouter`);
  if (!APPLY || missing.length === 0) return;
  for (const batch of chunk(missing, 100)) {
    await turso.batch(
      batch.map((r) => ({
        sql: 'insert into "Encounter" (entryId, rawInput, matchedFormKey, source, context, createdAt, userId) values (?,?,?,?,?,?,?)',
        args: [r.entryId as InValue, (r.rawInput ?? "") as InValue, (r.matchedFormKey ?? null) as InValue, (r.source ?? null) as InValue, (r.context ?? null) as InValue, r.createdAt as InValue, user],
      })),
      "write",
    );
  }
  log(`                 ✓ ${missing.length} ajoutés`);
}

/** Quiz attempts are pure history: append whatever local has that prod doesn't. */
async function mergeQuizAttempts(turso: Client, local: Database.Database, user: string) {
  const remote = await turso.execute("select entryId, formKey, userAnswer, createdAt from QuizAttempt");
  const seen = new Set(remote.rows.map((r) => key(r.entryId, r.formKey, r.userAnswer, r.createdAt)));
  const rows = local
    .prepare("select entryId, formKey, userAnswer, correct, createdAt from QuizAttempt where userId = ?")
    .all(LOCAL_USER) as Record<string, unknown>[];
  const missing = rows.filter((r) => !seen.has(key(r.entryId, r.formKey, r.userAnswer, r.createdAt)));
  log(`QuizAttempt    : ${remote.rows.length} distants, ${rows.length} locaux → ${missing.length} à ajouter`);
  if (!APPLY || missing.length === 0) return;
  for (const batch of chunk(missing, 100)) {
    await turso.batch(
      batch.map((r) => ({
        sql: 'insert into "QuizAttempt" (entryId, formKey, userAnswer, correct, createdAt, userId) values (?,?,?,?,?,?)',
        args: [r.entryId as InValue, r.formKey as InValue, r.userAnswer as InValue, r.correct as InValue, r.createdAt as InValue, user],
      })),
      "write",
    );
  }
  log(`                 ✓ ${missing.length} ajoutés`);
}

/** SRS state: PK is (userId, entryId, formKey). When a card exists on both sides, the most
 * recently reviewed one wins — that's the state that reflects the latest practice. */
async function mergeFormReviews(turso: Client, local: Database.Database, user: string) {
  const remote = await turso.execute(
    "select entryId, formKey, lastReviewedAt from FormReview where userId = ?",
    [user],
  );
  const remoteBy = new Map(remote.rows.map((r) => [`${r.entryId}|${r.formKey}`, r.lastReviewedAt as string | null]));
  const rows = local
    .prepare("select entryId, formKey, ease, intervalDays, repetitions, lapses, dueAt, lastReviewedAt from FormReview where userId = ?")
    .all(LOCAL_USER) as Record<string, unknown>[];

  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  for (const r of rows) {
    const k = `${r.entryId}|${r.formKey}`;
    if (!remoteBy.has(k)) inserts.push(r);
    else {
      const theirs = remoteBy.get(k);
      const mine = r.lastReviewedAt as string | null;
      if (mine && (!theirs || String(mine) > String(theirs))) updates.push(r);
    }
  }
  log(`FormReview     : ${remote.rows.length} distants, ${rows.length} locaux → ${inserts.length} à ajouter, ${updates.length} à rafraîchir`);
  if (!APPLY) return;
  for (const batch of chunk(inserts, 100)) {
    await turso.batch(
      batch.map((r) => ({
        sql: 'insert into "FormReview" (userId, entryId, formKey, ease, intervalDays, repetitions, lapses, dueAt, lastReviewedAt) values (?,?,?,?,?,?,?,?,?)',
        args: [user, r.entryId as InValue, r.formKey as InValue, r.ease as InValue, r.intervalDays as InValue, r.repetitions as InValue, r.lapses as InValue, r.dueAt as InValue, (r.lastReviewedAt ?? null) as InValue],
      })),
      "write",
    );
  }
  for (const batch of chunk(updates, 100)) {
    await turso.batch(
      batch.map((r) => ({
        sql: 'update "FormReview" set ease=?, intervalDays=?, repetitions=?, lapses=?, dueAt=?, lastReviewedAt=? where userId=? and entryId=? and formKey=?',
        args: [r.ease as InValue, r.intervalDays as InValue, r.repetitions as InValue, r.lapses as InValue, r.dueAt as InValue, (r.lastReviewedAt ?? null) as InValue, user, r.entryId as InValue, r.formKey as InValue],
      })),
      "write",
    );
  }
  log(`                 ✓ ${inserts.length} ajoutés, ${updates.length} rafraîchis`);
}

async function mergeXpEvents(turso: Client, local: Database.Database, user: string) {
  const remote = await turso.execute("select amount, source, day, createdAt from XpEvent");
  const seen = new Set(remote.rows.map((r) => key(r.amount, r.source, r.day, r.createdAt)));
  const rows = local
    .prepare("select amount, source, day, createdAt from XpEvent where userId = ?")
    .all(LOCAL_USER) as Record<string, unknown>[];
  const missing = rows.filter((r) => !seen.has(key(r.amount, r.source, r.day, r.createdAt)));
  log(`XpEvent        : ${remote.rows.length} distants, ${rows.length} locaux → ${missing.length} à ajouter`);
  if (!APPLY || missing.length === 0) return;
  for (const batch of chunk(missing, 100)) {
    await turso.batch(
      batch.map((r) => ({
        sql: 'insert into "XpEvent" (userId, amount, source, day, createdAt) values (?,?,?,?,?)',
        args: [user, r.amount as InValue, r.source as InValue, r.day as InValue, r.createdAt as InValue],
      })),
      "write",
    );
  }
  log(`                 ✓ ${missing.length} ajoutés`);
}

/** Union of a small per-user table keyed by `keys`; `maxCol` (if given) keeps the higher value. */
async function mergeSimple(
  turso: Client,
  local: Database.Database,
  user: string,
  table: string,
  keys: string[],
  maxCol?: string,
) {
  const cols = [...keys, ...(maxCol ? [maxCol] : [])];
  const remote = await turso.execute(`select ${cols.join(",")} from "${table}" where userId = ?`, [user]);
  const remoteBy = new Map(remote.rows.map((r) => [keys.map((k) => r[k]).join("|"), r]));
  const rows = local
    .prepare(`select ${cols.join(",")} from "${table}" where userId = ?`)
    .all(LOCAL_USER) as Record<string, unknown>[];

  let added = 0;
  let bumped = 0;
  for (const r of rows) {
    const k = keys.map((x) => r[x]).join("|");
    const there = remoteBy.get(k);
    if (!there) {
      added++;
      if (APPLY) {
        await turso.execute({
          sql: `insert into "${table}" (userId, ${cols.join(",")}) values (${cols.map(() => "?").join(",")}, ?)`.replace(
            `(userId, ${cols.join(",")})`,
            `(userId, ${cols.join(",")})`,
          ),
          args: [user, ...cols.map((c) => r[c] as never)],
        });
      }
    } else if (maxCol && Number(r[maxCol]) > Number(there[maxCol])) {
      bumped++;
      if (APPLY) {
        await turso.execute({
          sql: `update "${table}" set ${maxCol}=? where userId=? and ${keys.map((k2) => `${k2}=?`).join(" and ")}`,
          args: [r[maxCol] as InValue, user, ...keys.map((k2) => r[k2] as never)],
        });
      }
    }
  }
  log(`${table.padEnd(15)}: ${remote.rows.length} distants, ${rows.length} locaux → ${added} à ajouter${maxCol ? `, ${bumped} à relever` : ""}`);
}

/** Rebuild totalXp / totalAttempts from the merged journals; keep the best streak. */
async function recomputeUserStats(turso: Client, user: string) {
  const xp = await turso.execute("select coalesce(sum(amount),0) as t from XpEvent where userId = ?", [user]);
  const att = await turso.execute("select count(*) as n from QuizAttempt where userId = ?", [user]);
  const total = Number(xp.rows[0].t);
  const attempts = Number(att.rows[0].n);
  log(`UserStats      : totalXp → ${total}, totalAttempts → ${attempts}`);
  if (!APPLY) return;
  await turso.execute({
    sql: 'update "UserStats" set totalXp=?, totalAttempts=? where userId=?',
    args: [total, attempts, user],
  });
  log("                 ✓ recalculé");
}

function key(...parts: unknown[]): string {
  return parts.map((p) => (p === null || p === undefined ? "" : String(p))).join(" ");
}
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
