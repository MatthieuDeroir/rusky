// One-off: run the (Mistral repair + DeepL widen) French-gloss enrichment for every word already
// in the user's collection, so it never needs to happen lazily/live during an exercise. Mirrors
// the exact logic of ensureFrenchGloss() in src/app/actions.ts (not exported, so re-implemented
// here against the same primitives) — safe to re-run, it only touches entries not yet checked.
//
// Uses raw @libsql/client (not the Next.js Prisma singleton in src/lib/db.ts, which reads its
// connection string at import time — too early for this script's own dotenv config()).
//
//   npx tsx scripts/backfill-french-glosses.ts            # dry run (default)
//   npx tsx scripts/backfill-french-glosses.ts --apply    # actually write
import { createClient, type InValue } from "@libsql/client";
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { repairFrenchGloss } from "../src/lib/mistral";
import { translateRuToFr, deeplConfigured } from "../src/lib/deepl";
import { normalizeFr } from "../src/lib/grammar";

const APPLY = process.argv.includes("--apply");
const DEEPL_GLOSS_MAX_LEN = 40;

interface Row {
  id: number;
  bare: string;
  accented: string;
  type: string;
  translationsFr: string | null;
  translationsEn: string | null;
  frChecked: number;
  deeplChecked: number;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL manquant");
  console.log("DeepL configuré :", deeplConfigured());
  const turso = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const q = await turso.execute(`
    select distinct e.id, e.bare, e.accented, e.type, e.translationsFr, e.translationsEn,
           e.frChecked, e.deeplChecked
    from DictionaryEntry e
    join Encounter enc on enc.entryId = e.id
    where e.frManual = 0 and (e.frChecked = 0 or e.deeplChecked = 0)
      -- id 18700 ("кошки") a été délibérément neutralisé plus tôt (doublon cassé de кошка,
      -- id 625) : translationsFr/En mis à null exprès pour l'exclure de Traduire. Ne pas le
      -- réenrichir, sinon le backfill le repopule et le fait réapparaître.
      and e.id != 18700
  `);
  const entries = q.rows as unknown as Row[];
  console.log(
    `${entries.length} mots découverts à vérifier.`,
    APPLY ? "\n>>> ÉCRITURE <<<\n" : "\n>>> SIMULATION (--apply pour écrire) <<<\n",
  );

  let changed = 0;
  let checkedOnly = 0;
  for (const [i, entry] of entries.entries()) {
    let fr = entry.translationsFr;
    const patch: { translationsFr?: string; frChecked?: boolean; deeplChecked?: boolean } = {};

    if (!entry.frChecked) {
      const fix = await repairFrenchGloss({
        accented: entry.accented,
        type: entry.type,
        en: entry.translationsEn,
        fr,
      });
      if (fix.changed) fr = fix.fr ?? fr;
      patch.frChecked = true;
      if (fix.changed && fr) patch.translationsFr = fr;
    }

    if (!entry.deeplChecked) {
      const extra = await translateRuToFr(entry.bare);
      patch.deeplChecked = true;
      if (extra && extra.length <= DEEPL_GLOSS_MAX_LEN) {
        const existing = (fr ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const alreadyCovered = existing.some((e) => normalizeFr(e) === normalizeFr(extra));
        if (!alreadyCovered) {
          fr = existing.length > 0 ? `${fr}, ${extra}` : extra;
          patch.translationsFr = fr;
        }
      }
    }

    if (patch.translationsFr !== undefined) {
      changed++;
      console.log(
        `  [${i + 1}/${entries.length}] ${entry.bare}: "${entry.translationsFr}" -> "${fr}"`,
      );
    } else {
      checkedOnly++;
    }

    if (APPLY) {
      const sets: string[] = [];
      const args: InValue[] = [];
      if (patch.translationsFr !== undefined) {
        sets.push("translationsFr = ?");
        args.push(patch.translationsFr);
      }
      if (patch.frChecked) sets.push("frChecked = 1");
      if (patch.deeplChecked) sets.push("deeplChecked = 1");
      if (sets.length > 0) {
        args.push(entry.id);
        await turso.execute({ sql: `update DictionaryEntry set ${sets.join(", ")} where id = ?`, args });
      }
    }
  }

  console.log(
    `\n${changed} traductions enrichies, ${checkedOnly} déjà correctes (juste marquées vérifiées).`,
  );
  console.log(APPLY ? "✓ Terminé." : "(simulation — rien n'a été écrit)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
