/** "Did you mean …?" suggestions for unknown attribute names (plan E1.3). */

/**
 * Levenshtein edit distance extended with adjacent transpositions (optimal string alignment), so
 * the most common typo, swapped letters (`drak` → `dark`), costs 1 instead of 2. Abandons early
 * once the distance must exceed `max` (returning `max + 1`): suggestion lookups compare one key
 * against every sibling, so bailing early matters.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, (prev2[j - 2] as number) + 1);
      }
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] as number;
}

/**
 * The closest candidate to `word`, or `undefined` if none is close enough. Case differences are
 * free (`Marker` → `marker`); otherwise the allowed distance scales with word length (1 for short
 * names, up to a third of the length).
 */
export function suggest(word: string, candidates: Iterable<string>): string | undefined {
  const lower = word.toLowerCase();
  const max = Math.max(1, Math.floor(word.length / 3));
  let best: string | undefined;
  let bestDist = max + 1;
  for (const c of candidates) {
    const d = c.toLowerCase() === lower ? 0 : editDistance(lower, c.toLowerCase(), bestDist - 1);
    if (d < bestDist) {
      best = c;
      bestDist = d;
      if (d === 0) break;
    }
  }
  return best;
}
