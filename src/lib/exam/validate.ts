// Pipeline de validation en 6 passes (§B du plan) — rejette tout ce que Mistral produit de
// travers avant que l'item ne soit servi. Chaque passe pousse son résultat dans `validatedBy`
// pour traçabilité et pour /admin/health.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeBare } from "@/lib/grammar";
import { solveLexgramItem } from "@/lib/mistral";
import type { LexgramSlot } from "./blueprints/lexgram-v1";
import type { LexgramAnswerKey, LexgramPayload, DistractorClass } from "./types";

const OptionSchema = z.object({
  text: z.string().trim().min(1),
  class: z.enum([
    "wrong-case",
    "wrong-aspect",
    "wrong-prefix",
    "wrong-number",
    "wrong-gender-agree",
    "wrong-government",
    "wrong-conjugation",
    "correct",
  ]),
});

const LexgramItemSchema = z.object({
  stem: z.string().trim().min(1),
  options: z.array(OptionSchema).length(4),
});

export interface ValidationStep {
  pass: number;
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ValidationResult {
  ok: boolean;
  quarantined: boolean;
  steps: ValidationStep[];
  payload?: LexgramPayload;
  answerKey?: LexgramAnswerKey;
}

const LATIN_RE = /[a-zA-Z]/;

function normalizeYo(text: string): string {
  return text.replace(/Ё/g, "Е").replace(/ё/g, "е");
}

async function passLexicon(payload: LexgramPayload, userId?: string): Promise<ValidationStep> {
  const words = new Set(
    normalizeBare(payload.stem)
      .replace(/[.,!?;:"«»()___]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  if (words.size === 0) return { pass: 4, name: "lexique", ok: true };

  const bares = [...words];
  const inDictionary = await prisma.dictionaryEntry.findMany({
    where: { bare: { in: bares } },
    select: { bare: true, inB1Minimum: true, partner: true },
  });
  // Un verbe dont le partenaire aspectuel est dans le minimum B1 est toléré lui aussi (ex.
  // "достигать" est listé, "достичь" — sa forme perfective, pas une entrée séparée du lexique
  // officiel — ne l'est pas mais reste un mot B1 au sens propre).
  const partnerBares = inDictionary.map((d) => d.partner).filter((p): p is string => !!p);
  const partnerEntries = partnerBares.length
    ? await prisma.dictionaryEntry.findMany({
        where: { bare: { in: partnerBares } },
        select: { bare: true, inB1Minimum: true },
      })
    : [];
  const partnerB1 = new Map(partnerEntries.map((p) => [p.bare, p.inB1Minimum]));
  const known = new Map<string, boolean>();
  for (const d of inDictionary) {
    const b1 = d.inB1Minimum || (d.partner ? (partnerB1.get(d.partner) ?? false) : false);
    known.set(d.bare, known.get(d.bare) || b1);
  }

  let userPokedex: Set<string> = new Set();
  if (userId) {
    const encountered = await prisma.encounter.findMany({
      where: { userId, entryId: { not: null } },
      select: { entry: { select: { bare: true } } },
    });
    userPokedex = new Set(encountered.map((e) => e.entry?.bare).filter((b): b is string => !!b));
  }

  const outOfScope = bares.filter((b) => {
    if (known.get(b)) return false; // dans le minimum B1
    if (userPokedex.has(b)) return false; // déjà dans le pokédex de l'utilisateur
    if (!known.has(b)) return false; // mot hors dictionnaire (nom propre, particule…) — toléré
    return true; // connu du dictionnaire mais ni B1 ni pokédex → hors scope B1
  });

  // Tolérance d'un mot hors minimum B1 par phrase : un LLM ne peut pas connaître exactement la
  // frontière d'une liste curatée de 2500 mots (aucune liste ne lui est transmise, juste une
  // consigne). En zéro tolérance, observé en prod : rejet quasi systématique sur un seul mot
  // isolé (souvent un mot A1/A2 déjà connu mais absent de la liste, ex. "местный", "зонтик").
  const TOLERANCE = 1;
  const ok = outOfScope.length <= TOLERANCE;
  return {
    pass: 4,
    name: "lexique",
    ok,
    detail: ok ? undefined : `hors minimum B1 : ${outOfScope.join(", ")}`,
  };
}

/** Passe 5, spécifique à case-government-verb : structure du trou + le verbe cible est présent. */
function passTargetCaseGovernmentVerb(payload: LexgramPayload, slot: LexgramSlot): ValidationStep {
  const blanks = (payload.stem.match(/___/g) ?? []).length;
  if (blanks !== 1) {
    return { pass: 5, name: "cible", ok: false, detail: `${blanks} trou(s) au lieu de 1` };
  }
  const verb = slot.targetId.replace(/^[a-z]+-after-/, "");
  const verbPrefix = normalizeBare(verb).slice(0, 2);
  const tokens = normalizeBare(payload.stem).split(/[^а-яa-z]+/);
  const present = tokens.some((t) => t.length >= 2 && t.slice(0, 2) === verbPrefix);
  return {
    pass: 5,
    name: "cible",
    ok: present,
    detail: present ? undefined : `verbe « ${verb} » introuvable dans la phrase`,
  };
}

async function passCounterResolution(payload: LexgramPayload): Promise<ValidationStep> {
  try {
    const raw = await solveLexgramItem(
      payload.stem,
      payload.options.map((o) => o.text),
    );
    const parsed = z.object({ correctIndex: z.number().int() }).safeParse(raw);
    if (!parsed.success) return { pass: 6, name: "contre-résolution", ok: false, detail: "solveur : réponse malformée" };
    const solverIndex = parsed.data.correctIndex;
    const trueIndex = payload.options.findIndex((o) => o.class === "correct");
    const agree = solverIndex === trueIndex;
    return {
      pass: 6,
      name: "contre-résolution",
      ok: agree,
      detail: agree ? undefined : `solveur a choisi l'option ${solverIndex}, attendu ${trueIndex}`,
    };
  } catch (e) {
    return {
      pass: 6,
      name: "contre-résolution",
      ok: false,
      detail: `appel solveur échoué : ${e instanceof Error ? e.message : "erreur"}`,
    };
  }
}

export async function validateLexgramItem(
  raw: unknown,
  slot: LexgramSlot,
  userId?: string,
): Promise<ValidationResult> {
  const steps: ValidationStep[] = [];

  const parsed = LexgramItemSchema.safeParse(raw);
  steps.push({
    pass: 1,
    name: "schéma",
    ok: parsed.success,
    detail: parsed.success ? undefined : parsed.error.issues.map((i) => i.message).join("; "),
  });
  if (!parsed.success) return { ok: false, quarantined: false, steps };
  const item = parsed.data;

  const rawText = item.stem + item.options.map((o) => o.text).join(" ");
  const alphabetOk = !LATIN_RE.test(rawText);
  steps.push({ pass: 2, name: "alphabet", ok: alphabetOk, detail: alphabetOk ? undefined : "caractères latins détectés" });
  if (!alphabetOk) return { ok: false, quarantined: false, steps };
  const normalized: LexgramPayload = {
    stem: normalizeYo(item.stem),
    options: item.options.map((o) => ({ text: normalizeYo(o.text), class: o.class as DistractorClass | "correct" })),
  };

  const texts = normalized.options.map((o) => o.text.trim().toLowerCase());
  const distinct = new Set(texts).size === texts.length;
  const correctCount = normalized.options.filter((o) => o.class === "correct").length;
  const lengths = texts.map((t) => t.length);
  const lengthRatio = Math.max(...lengths) / Math.max(1, Math.min(...lengths));
  const structureOk = distinct && correctCount === 1 && lengthRatio <= 3;
  steps.push({
    pass: 3,
    name: "structure QCM",
    ok: structureOk,
    detail: structureOk
      ? undefined
      : `distinct=${distinct} correct=${correctCount} lengthRatio=${lengthRatio.toFixed(1)}`,
  });
  if (!structureOk) return { ok: false, quarantined: false, steps };

  const lexiconStep = await passLexicon(normalized, userId);
  steps.push(lexiconStep);
  if (!lexiconStep.ok) return { ok: false, quarantined: false, steps };

  const targetStep = passTargetCaseGovernmentVerb(normalized, slot);
  steps.push(targetStep);
  if (!targetStep.ok) return { ok: false, quarantined: false, steps };

  const counterStep = await passCounterResolution(normalized);
  steps.push(counterStep);
  if (!counterStep.ok) {
    // Désaccord du solveur : mis en quarantaine plutôt que rejeté (peut être une clé fausse OU
    // un item ambigu — dans les deux cas hors examen tant que non tranché sur /admin/quarantine).
    return { ok: false, quarantined: true, steps, payload: normalized };
  }

  const correctIndex = normalized.options.findIndex((o) => o.class === "correct");
  return {
    ok: true,
    quarantined: false,
    steps,
    payload: normalized,
    answerKey: { correctIndex },
  };
}
