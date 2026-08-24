// PRNG seedé et déterministe (mulberry32) — utilisé pour que le blueprint d'un TrkiPaper soit
// rejouable depuis son seed (traçabilité, débogage), et pour le tirage sans remise des cibles.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash simple d'une chaîne en entier 32 bits — pour dériver un seed numérique d'un userId/string. */
export function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export function makeRng(seed: string | number): () => number {
  return mulberry32(typeof seed === "string" ? hashSeed(seed) : seed);
}

/** Tirage sans remise de `count` éléments distincts de `pool`, via le rng fourni. */
export function sampleWithoutReplacement<T>(pool: T[], count: number, rng: () => number): T[] {
  const copy = pool.slice();
  const result: T[] = [];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

/** Fisher-Yates seedé, pour l'ordre stable d'une liste entière (§L, cohortes du parcours B1). */
export function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
