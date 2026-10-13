import "server-only";
import { prisma } from "@/lib/db";
import { normalizeBare } from "@/lib/grammar";
import { lookupCandidates } from "@/lib/reader/analyze";
import { splitParagraphs, splitSentences, tokenize } from "@/lib/reader/segment";
import type { ReaderAnalysis } from "@/lib/reader/types";

/** Mots-outils (prépositions, conjonctions, pronoms) parmi les plus fréquents du parcours : on
 * les lit sans les avoir « appris » un par un — ils comptent comme familiers. */
const FUNCTION_WORD_RANK = 300;

/** Lemmes familiers : mots connus ou en cours d'apprentissage + mots-outils fréquents.
 * `b1Only` : seulement les mots du lexique B1 (génération des textes : l'examen porte sur eux).
 * `knownOnly` : seulement les mots connus (textes d'entraînement). */
export async function familiarEntryIds(userId: string, { b1Only = false, knownOnly = false } = {}): Promise<Set<number>> {
  const [words, tools] = await Promise.all([
    prisma.word.findMany({
      where: { userId, ...(b1Only ? { entry: { b1Rank: { not: null } } } : {}), ...(knownOnly ? { status: "KNOWN" } : {}) },
      select: { entryId: true, entry: { select: { type: true, bare: true, partner: true } } } }),
    prisma.dictionaryEntry.findMany({
      where: { b1Rank: { lt: FUNCTION_WORD_RANK }, type: { in: ["pronoun", "other"] } },
      select: { id: true },
    }),
  ]);
  // Partenaire d'aspect d'un verbe connu (брать → взять, понимать → понять) : même mot, autre aspect.
  const verbs = words.filter((w) => w.entry.type === "verb");
  const partnerBares = new Set(
    verbs.flatMap((w) => (w.entry.partner ?? "").split(/[;,]/).map((x) => x.trim()).filter((x) => x && x !== "-")),
  );
  // Les partenaires déclarés par les verbes connus (correspondance exacte sur la forme du
  // dictionnaire : « дать » ne valide pas « передать »). Une seule requête ciblée.
  const partners = partnerBares.size
    ? await prisma.dictionaryEntry.findMany({ where: { type: "verb", bare: { in: [...partnerBares] } }, select: { id: true } })
    : [];
  return new Set([...words.map((w) => w.entryId), ...tools.map((t) => t.id), ...partners.map((x) => x.id)]);
}

export interface Coverage {
  known: number;
  total: number;
  /** Lemmes (forme du dictionnaire) des mots non familiers, sans doublon. */
  unknown: string[];
  /** Toutes les entrées du dictionnaire possibles pour les mots du texte (présence d'un mot imposé). */
  seen: Set<number>;
}

export function ratio(c: Coverage): number {
  return c.total ? c.known / c.total : 1;
}

/** Couverture d'un texte brut (avant analyse) : un mot est familier si une de ses lectures
 * possibles dans le dictionnaire l'est. Les noms propres (majuscule hors début de phrase,
 * absents du dictionnaire) sont ignorés. */
export async function bodyCoverage(body: string, familiar: Set<number>): Promise<Coverage> {
  const tokens: { norm: string; raw: string; first: boolean }[] = [];
  for (const p of splitParagraphs(body))
    for (const s of splitSentences(p)) {
      let first = true;
      for (const t of tokenize(s)) {
        if (!t.word) continue;
        tokens.push({ norm: normalizeBare(t.t), raw: t.t, first });
        first = false;
      }
    }
  const cands = await lookupCandidates([...new Set(tokens.map((t) => t.norm))]);
  let known = 0;
  let total = 0;
  const unknown = new Set<string>();
  const seen = new Set<number>();
  for (const t of tokens) {
    const list = cands.get(t.norm) ?? [];
    for (const c of list) seen.add(c.entryId);
    const capital = t.raw[0] !== t.raw[0].toLowerCase();
    if (list.length === 0 && capital && !t.first) continue;
    total++;
    if (list.some((c) => familiar.has(c.entryId))) known++;
    else unknown.add(list[0]?.lemmaBare ?? t.norm);
  }
  return { known, total, unknown: [...unknown], seen };
}

/** Couverture d'un texte analysé (lecture choisie par l'analyse) + les mots nouveaux. */
export function analysisCoverage(
  analysis: ReaderAnalysis,
  familiar: Set<number>,
): { known: number; total: number; newEntryIds: number[] } {
  let known = 0;
  let total = 0;
  const fresh = new Set<number>();
  for (const p of analysis.paragraphs)
    for (const s of p.sentences ?? [])
      s.words.forEach((w, i) => {
        const capital = w.raw[0] !== w.raw[0].toLowerCase();
        if (w.entryId === null && capital && i > 0) return; // nom propre
        total++;
        if (w.entryId !== null && familiar.has(w.entryId)) known++;
        else if (w.entryId !== null) fresh.add(w.entryId);
      });
  return { known, total, newEntryIds: [...fresh] };
}
