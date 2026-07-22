// Build a compact French-translations map (committed: data/translations_fr.json)
// from the WikDict ru-fr SQLite dump (data/_raw/ru-fr.sqlite3, not committed).
// Keyed by normalized bare form so it matches DictionaryEntry.bare during seeding.
//
// Source: WikDict (https://www.wikdict.com), derived from Wiktionary (CC BY-SA).
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeBare } from "../src/lib/grammar";

const SRC = join(process.cwd(), "data", "_raw", "ru-fr.sqlite3");
const OUT = join(process.cwd(), "data", "translations_fr.json");
const MAX_SENSES = 4;

const db = new Database(SRC, { readonly: true });
const rows = db
  .prepare("SELECT written_rep, trans_list FROM simple_translation")
  .all() as { written_rep: string; trans_list: string }[];

const chosen: Record<string, { fr: string; lower: boolean }> = {};
for (const { written_rep, trans_list } of rows) {
  if (!written_rep || !trans_list) continue;
  // Skip obviously non-lexical entries (symbols, multi-word noise).
  const key = normalizeBare(written_rep);
  if (!key || /[^а-яё\s-]/i.test(written_rep)) continue;

  const fr = trans_list
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SENSES)
    .join(", ");
  if (!fr) continue;

  // Prefer the lowercase form (common noun) over a capitalized homograph (proper noun,
  // e.g. «Яблоко» the party → «Iabloko»); among same-case candidates, keep the richest gloss.
  const lower = written_rep === written_rep.toLowerCase();
  const cur = chosen[key];
  const better =
    !cur ||
    (lower && !cur.lower) ||
    (lower === cur.lower && fr.length > cur.fr.length);
  if (better) chosen[key] = { fr, lower };
}

const map: Record<string, string> = {};
for (const key of Object.keys(chosen)) map[key] = chosen[key].fr;

writeFileSync(OUT, JSON.stringify(map, null, 0));
console.log(`[gen-fr] wrote ${Object.keys(map).length} French entries -> ${OUT}`);
db.close();
