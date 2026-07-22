// Latin → Cyrillic transliteration with ambiguity branching, to suggest Russian spellings
// for a Latin-typed word (the user has a Latin keyboard). Greedy longest-match segmentation
// handles digraphs (sh, ch, zh, shch, ya…), and letters with several plausible Cyrillic
// readings (e→е/э, i→и/й, c→ц/к, y→ы/й…) produce alternative candidates.

// Ordered longest-first; each Latin chunk maps to one or more Cyrillic options (primary first).
const RULES: [string, string[]][] = [
  ["shch", ["щ"]],
  ["sch", ["щ"]],
  ["shh", ["щ"]],
  ["yo", ["ё"]],
  ["jo", ["ё"]],
  ["yu", ["ю"]],
  ["ju", ["ю"]],
  ["ya", ["я"]],
  ["ja", ["я"]],
  ["ye", ["е", "э"]],
  ["je", ["е"]],
  ["yi", ["ы"]],
  ["zh", ["ж"]],
  ["ch", ["ч"]],
  ["sh", ["ш", "щ"]],
  ["kh", ["х"]],
  ["ts", ["ц"]],
  ["a", ["а"]],
  ["b", ["б"]],
  ["v", ["в"]],
  ["w", ["в"]],
  ["g", ["г", "ж"]],
  ["d", ["д"]],
  ["e", ["е", "э"]],
  ["z", ["з"]],
  ["i", ["и", "й"]],
  ["j", ["й", "ж"]],
  ["k", ["к"]],
  ["l", ["л"]],
  ["m", ["м"]],
  ["n", ["н"]],
  ["o", ["о"]],
  ["p", ["п"]],
  ["r", ["р"]],
  ["s", ["с"]],
  ["t", ["т"]],
  ["u", ["у"]],
  ["f", ["ф"]],
  ["h", ["х"]],
  ["c", ["ц", "к"]],
  ["y", ["ы", "й"]],
  ["x", ["кс"]],
  ["q", ["к"]],
  ["'", ["ь", "ъ"]],
];

const LOOKUP = new Map(RULES);
const MAX_KEY = 4;
const MAX_CANDIDATES = 8;
const BEAM = 24;

/**
 * Transliterate a Latin word into ranked Cyrillic candidates (best first). Returns at most
 * MAX_CANDIDATES. If the input has no Latin letters, returns [].
 */
export function transliterate(input: string): string[] {
  const s = input.toLowerCase();
  if (!/[a-z']/.test(s)) return [];

  let cands = [""];
  let i = 0;
  while (i < s.length) {
    let options: string[] | null = null;
    let len = 1;
    for (let l = Math.min(MAX_KEY, s.length - i); l >= 1; l--) {
      const hit = LOOKUP.get(s.slice(i, i + l));
      if (hit) {
        options = hit;
        len = l;
        break;
      }
    }
    if (!options) options = [s[i]]; // pass unknown chars through unchanged

    const next: string[] = [];
    for (const c of cands) {
      for (const opt of options) {
        next.push(c + opt);
        if (next.length >= BEAM) break;
      }
      if (next.length >= BEAM) break;
    }
    cands = next;
    i += len;
  }

  return [...new Set(cands)].slice(0, MAX_CANDIDATES);
}
