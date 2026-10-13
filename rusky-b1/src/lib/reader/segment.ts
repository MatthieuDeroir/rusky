// Découpage pur (sans IA ni base) d'un texte russe : paragraphes → phrases → morceaux.
// Le texte d'origine est reconstituable à l'identique en concaténant les morceaux.

export interface RawToken {
  t: string;
  /** true = mot cyrillique à analyser. */
  word: boolean;
}

/** Une ligne = un paragraphe (les textes collés et les dialogues « — … » vont souvent à la ligne). */
export function splitParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/** Coupe après . ! ? … (éventuellement suivis de guillemets/parenthèses fermants) quand la suite
 * commence comme une nouvelle phrase (majuscule, guillemet ouvrant, chiffre, ou tiret de dialogue
 * suivi d'une majuscule — « — Почему ты плачешь? — спросил старик. » reste une seule phrase). */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…]+[»"”)]*)\s+(?=[«"„“(\p{Lu}\d]|[—–-]\s*[«"„\p{Lu}])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

const WORD_RE = /([\p{L}́̀]+(?:-[\p{L}́̀]+)*)/u;

export function tokenize(sentence: string): RawToken[] {
  return sentence
    .split(WORD_RE)
    .filter((t) => t !== "")
    .map((t) => ({ t, word: WORD_RE.test(t) && /[а-яё]/i.test(t) }));
}
