// Seeds the read-only reference dictionary from the OpenRussian TSV files and the
// curated supplement (pronouns + numerals). Idempotent: skips if already seeded
// unless FORCE_RESEED=1. Never touches user data (Encounter / QuizAttempt).
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBare, type WordType } from "../src/lib/grammar";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });
const DATA_DIR = join(process.cwd(), "data");

// French translations (built from WikDict ru-fr by scripts/gen-fr-translations.ts),
// keyed by normalized bare form.
const frMap: Record<string, string> = JSON.parse(
  readFileSync(join(DATA_DIR, "translations_fr.json"), "utf8"),
);

type Row = Record<string, string>;

interface EntrySeed {
  id: number;
  bare: string;
  accented: string;
  type: WordType;
  gender: string | null;
  aspect: string | null;
  animate: boolean | null;
  indeclinable: boolean | null;
  sgOnly: boolean | null;
  plOnly: boolean | null;
  comparative: string | null;
  superlative: string | null;
  partner: string | null;
  translationsFr: string | null;
  translationsEn: string | null;
  translationsDe: string | null;
}
interface FormSeed {
  entryId: number;
  formKey: string;
  accented: string;
  bareForm: string;
  variantIndex: number;
}

const entries: EntrySeed[] = [];
const forms: FormSeed[] = [];
let nextId = 1;

const bool = (v: string | undefined): boolean | null =>
  v === undefined || v === "" ? null : v === "1" || v === "true";
const orNull = (v: string | undefined): string | null =>
  v && v.trim() !== "" ? v.trim() : null;

function readTsv(file: string): Row[] {
  const text = readFileSync(join(DATA_DIR, file), "utf8");
  return parse(text, {
    delimiter: "\t",
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Row[];
}

// OpenRussian uses these as "this form does not exist" placeholders (defective verbs, etc.).
// They must NOT become real forms (otherwise e.g. «нет» would match житься).
const FORM_PLACEHOLDERS = new Set(["нет", "нету", "-", "—", "–", "*"]);

/** Add an entry plus its forms. `formCols` maps formKey -> raw cell value. */
function addEntry(
  base: Omit<EntrySeed, "id" | "translationsFr">,
  formCols: Record<string, string | undefined>,
) {
  const id = nextId++;
  entries.push({ ...base, id, translationsFr: frMap[base.bare] ?? null });
  for (const [formKey, raw] of Object.entries(formCols)) {
    if (!raw || raw.trim() === "") continue;
    const variants = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((v) => !FORM_PLACEHOLDERS.has(normalizeBare(v)));
    variants.forEach((accented, variantIndex) => {
      forms.push({
        entryId: id,
        formKey,
        accented,
        bareForm: normalizeBare(accented),
        variantIndex,
      });
    });
  }
}

const NOUN_FORMS = [
  "sg_nom", "sg_gen", "sg_dat", "sg_acc", "sg_inst", "sg_prep",
  "pl_nom", "pl_gen", "pl_dat", "pl_acc", "pl_inst", "pl_prep",
];
const VERB_FORMS = [
  "imperative_sg", "imperative_pl",
  "past_m", "past_f", "past_n", "past_pl",
  "presfut_sg1", "presfut_sg2", "presfut_sg3",
  "presfut_pl1", "presfut_pl2", "presfut_pl3",
];
const ADJ_FORMS = [
  "short_m", "short_f", "short_n", "short_pl",
  ...["m", "f", "n", "pl"].flatMap((g) =>
    ["nom", "gen", "dat", "acc", "inst", "prep"].map((c) => `decl_${g}_${c}`),
  ),
];

function pick(row: Row, keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}

async function main() {
  const existing = await prisma.dictionaryEntry.count();
  if (existing > 0 && process.env.FORCE_RESEED !== "1") {
    console.log(
      `[seed] ${existing} entries already present — skipping. Set FORCE_RESEED=1 to rebuild.`,
    );
    return;
  }

  // ---- Curated supplement first, so we know which `others.csv` rows to skip ----
  const supplementBares = new Set<string>();
  for (const file of readdirSync(join(DATA_DIR, "supplement")).filter((f) =>
    f.endsWith(".json"),
  )) {
    const doc = JSON.parse(
      readFileSync(join(DATA_DIR, "supplement", file), "utf8"),
    ) as {
      type: WordType;
      entries: {
        accented: string;
        gender?: string;
        translationsEn?: string;
        forms: Record<string, string>;
      }[];
    };
    for (const e of doc.entries) {
      const bare = normalizeBare(e.accented);
      supplementBares.add(bare);
      addEntry(
        {
          bare,
          accented: e.accented,
          type: doc.type,
          gender: e.gender ?? null,
          aspect: null,
          animate: null,
          indeclinable: null,
          sgOnly: null,
          plOnly: null,
          comparative: null,
          superlative: null,
          partner: null,
          translationsEn: e.translationsEn ?? null,
          translationsDe: null,
        },
        e.forms,
      );
    }
    console.log(`[seed] supplement ${file}: +${doc.entries.length} entries`);
  }

  // ---- Nouns ----
  for (const r of readTsv("nouns.csv")) {
    addEntry(
      {
        bare: normalizeBare(r.bare),
        accented: r.accented || r.bare,
        type: "noun",
        gender: orNull(r.gender),
        aspect: null,
        animate: bool(r.animate),
        indeclinable: bool(r.indeclinable),
        sgOnly: bool(r.sg_only),
        plOnly: bool(r.pl_only),
        comparative: null,
        superlative: null,
        partner: orNull(r.partner),
        translationsEn: orNull(r.translations_en),
        translationsDe: orNull(r.translations_de),
      },
      pick(r, NOUN_FORMS),
    );
  }

  // ---- Verbs ----
  for (const r of readTsv("verbs.csv")) {
    addEntry(
      {
        bare: normalizeBare(r.bare),
        accented: r.accented || r.bare,
        type: "verb",
        gender: null,
        aspect: orNull(r.aspect),
        animate: null,
        indeclinable: null,
        sgOnly: null,
        plOnly: null,
        comparative: null,
        superlative: null,
        partner: orNull(r.partner),
        translationsEn: orNull(r.translations_en),
        translationsDe: orNull(r.translations_de),
      },
      pick(r, VERB_FORMS),
    );
  }

  // ---- Adjectives ----
  for (const r of readTsv("adjectives.csv")) {
    addEntry(
      {
        bare: normalizeBare(r.bare),
        accented: r.accented || r.bare,
        type: "adjective",
        gender: null,
        aspect: null,
        animate: null,
        indeclinable: null,
        sgOnly: null,
        plOnly: null,
        comparative: orNull(r.comparative),
        superlative: orNull(r.superlative),
        partner: null,
        translationsEn: orNull(r.translations_en),
        translationsDe: orNull(r.translations_de),
      },
      pick(r, ADJ_FORMS),
    );
  }

  // ---- Others (truly invariable). Skip rows the supplement already covers. ----
  let skipped = 0;
  for (const r of readTsv("others.csv")) {
    const bare = normalizeBare(r.bare);
    if (supplementBares.has(bare)) {
      skipped++;
      continue;
    }
    addEntry(
      {
        bare,
        accented: r.accented || r.bare,
        type: "other",
        gender: null,
        aspect: null,
        animate: null,
        indeclinable: null,
        sgOnly: null,
        plOnly: null,
        comparative: null,
        superlative: null,
        partner: null,
        translationsEn: orNull(r.translations_en),
        translationsDe: orNull(r.translations_de),
      },
      {},
    );
  }
  console.log(`[seed] others.csv: skipped ${skipped} rows covered by supplement`);

  // ---- Verb form overrides (fix forms missing/wrong in OpenRussian, e.g. быть → буду) ----
  const overridesDoc = JSON.parse(
    readFileSync(join(DATA_DIR, "verb-overrides.json"), "utf8"),
  ) as { verbs: { bare: string; forms: Record<string, string> }[] };
  let overridden = 0;
  for (const ov of overridesDoc.verbs) {
    const bare = normalizeBare(ov.bare);
    const entry = entries.find((e) => e.type === "verb" && e.bare === bare);
    if (!entry) continue;
    const keys = new Set(Object.keys(ov.forms));
    for (let i = forms.length - 1; i >= 0; i--) {
      if (forms[i].entryId === entry.id && keys.has(forms[i].formKey)) forms.splice(i, 1);
    }
    for (const [formKey, raw] of Object.entries(ov.forms)) {
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((accented, variantIndex) => {
          forms.push({ entryId: entry.id, formKey, accented, bareForm: normalizeBare(accented), variantIndex });
        });
    }
    overridden++;
  }
  console.log(`[seed] applied verb overrides to ${overridden} verb(s)`);

  // ---- Reclassify adjectival pronouns (declined like adjectives) as pronouns, so all
  // pronouns are grouped & treated uniformly (они already decline by gender in one entry). ----
  const PRONOUN_LEMMAS = new Set(
    [
      "мой", "твой", "свой", "наш", "ваш",
      "этот", "тот", "такой", "сей", "этакий",
      "сам", "самый", "весь", "всякий", "каждый", "любой", "иной",
      "какой", "каков", "который", "чей",
      "некоторый", "некий", "никакой", "ничей",
    ].map(normalizeBare),
  );
  let reclassified = 0;
  for (const e of entries) {
    if (e.type === "adjective" && PRONOUN_LEMMAS.has(e.bare)) {
      e.type = "pronoun";
      reclassified++;
    }
  }
  console.log(`[seed] reclassified ${reclassified} adjectival pronouns as pronouns`);

  // ---- Lexical overrides: fix meanings the auto-translation gets wrong (e.g. existential есть) ----
  const lexDoc = JSON.parse(
    readFileSync(join(DATA_DIR, "lexical-overrides.json"), "utf8"),
  ) as {
    entries: { bare: string; type: WordType; fromType?: WordType; translationsFr: string }[];
  };
  let lexFixed = 0;
  for (const ov of lexDoc.entries) {
    const bare = normalizeBare(ov.bare);
    // `fromType` set → reclassify a mis-categorized entry (e.g. как listed as adjective in
    // OpenRussian but really invariable). Otherwise just correct the translation.
    const entry = ov.fromType
      ? entries.find((e) => e.bare === bare && e.type === ov.fromType)
      : entries.find((e) => e.bare === bare && e.type === ov.type);
    if (!entry) continue;
    if (ov.fromType) entry.type = ov.type;
    entry.translationsFr = ov.translationsFr;
    lexFixed++;
  }
  console.log(`[seed] applied ${lexFixed} lexical override(s)`);

  // ---- Write to DB ----
  // Preserve manually-entered French translations across a forced re-seed
  // (these are user data — must not be lost). A translation is "manual" when it
  // differs from what the offline source (frMap) would produce for that lemma.
  const manualFr = new Map<string, string>(); // `${bare}|${type}` -> fr
  if (existing > 0) {
    const prev = await prisma.dictionaryEntry.findMany({
      where: { translationsFr: { not: null } },
      select: { bare: true, type: true, translationsFr: true, frManual: true },
    });
    for (const e of prev) {
      // Preserve a translation only if the user entered it: either explicitly flagged
      // manual, or it fills a gap the offline source has no entry for. (NOT stale auto
      // values that merely differ from the current frMap — those must refresh.)
      const isGapFill = frMap[e.bare] === undefined;
      if (e.translationsFr && (e.frManual || isGapFill)) {
        manualFr.set(`${e.bare}|${e.type}`, e.translationsFr);
      }
    }
    console.log(
      `[seed] FORCE_RESEED: clearing reference tables (preserving ${manualFr.size} manual translations)…`,
    );
    await prisma.dictionaryForm.deleteMany();
    await prisma.dictionaryEntry.deleteMany();
  }

  console.log(`[seed] inserting ${entries.length} entries, ${forms.length} forms…`);
  const CHUNK = 2000;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await prisma.dictionaryEntry.createMany({ data: entries.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < forms.length; i += CHUNK) {
    await prisma.dictionaryForm.createMany({ data: forms.slice(i, i + CHUNK) });
  }

  // Re-apply preserved manual translations (matched by stable bare + type).
  for (const [key, fr] of manualFr) {
    const [bare, type] = key.split("|");
    await prisma.dictionaryEntry.updateMany({
      where: { bare, type },
      data: { translationsFr: fr, frManual: true },
    });
  }
  if (manualFr.size > 0) {
    console.log(`[seed] re-applied ${manualFr.size} manual translations`);
  }

  // Self-heal: deleting entries set Encounter.entryId to NULL (onDelete SetNull). Re-link
  // the user's collection to the rebuilt dictionary by rawInput + matchedFormKey, so a
  // re-seed never loses the user's words.
  const orphans = await prisma.encounter.findMany({ where: { entryId: null } });
  let relinked = 0;
  for (const enc of orphans) {
    const norm = normalizeBare(enc.rawInput);
    let entryId: number | null = null;
    if (enc.matchedFormKey) {
      entryId =
        (await prisma.dictionaryForm.findFirst({
          where: { bareForm: norm, formKey: enc.matchedFormKey },
          select: { entryId: true },
        }))?.entryId ?? null;
    }
    if (entryId === null) {
      entryId =
        (await prisma.dictionaryForm.findFirst({
          where: { bareForm: norm },
          select: { entryId: true },
        }))?.entryId ?? null;
    }
    if (entryId === null) {
      entryId =
        (await prisma.dictionaryEntry.findFirst({ where: { bare: norm }, select: { id: true } }))
          ?.id ?? null;
    }
    if (entryId !== null) {
      // Drop a matchedFormKey the re-linked entry doesn't actually have (avoids mislabels,
      // e.g. a spurious verb form key landing on an invariable word).
      let matchedFormKey = enc.matchedFormKey;
      if (matchedFormKey) {
        const hasForm = await prisma.dictionaryForm.findFirst({
          where: { entryId, formKey: matchedFormKey },
          select: { id: true },
        });
        if (!hasForm) matchedFormKey = null;
      }
      await prisma.encounter.update({ where: { id: enc.id }, data: { entryId, matchedFormKey } });
      relinked++;
    }
  }
  if (orphans.length > 0) {
    console.log(`[seed] re-linked ${relinked}/${orphans.length} orphaned encounters`);
  }

  const byType = await prisma.dictionaryEntry.groupBy({
    by: ["type"],
    _count: true,
  });
  console.log("[seed] done. Entries by type:");
  for (const t of byType) console.log(`  ${t.type}: ${t._count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
