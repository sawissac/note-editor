/** A fuzzy hit: higher `score` ranks first; `indices` are matched chars. */
export type FuzzyMatch = { score: number; indices: number[] };

const WORD_START = /[\s/_\-.()[\]]/;

/**
 * Subsequence match of `query` in `text`, case-insensitive. Rewards
 * consecutive runs, word starts (after `/ _ - .` or a space, or a
 * camelCase hump) and an early first hit. Null when not every query
 * character appears in order.
 *
 * `strict` also rejects scattered hits: every matched character must follow
 * the previous one or start a word (`ren` → **Ren**ame, not **Re**veal i**n**).
 */
export function fuzzyMatch(
  query: string,
  text: string,
  { strict = false }: { strict?: boolean } = {},
): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();

  // A plain substring beats any scattered match — rank it as such.
  const at = t.indexOf(q);
  if (at >= 0) {
    const starts = at === 0 || WORD_START.test(text[at - 1]);
    return {
      score: 1000 + q.length * 10 + (starts ? 200 : 0) - at,
      indices: Array.from({ length: q.length }, (_, i) => at + i),
    };
  }

  const indices: number[] = [];
  let score = 0;
  let run = 0;
  let ti = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    const prev = indices.at(-1);
    run = prev !== undefined && found === prev + 1 ? run + 1 : 0;
    const boundary =
      found === 0 ||
      WORD_START.test(text[found - 1]) ||
      (text[found] !== t[found] && text[found - 1] === t[found - 1]);
    if (strict && run === 0 && !boundary) return null;
    score += 10 + run * 15 + (boundary ? 25 : 0) - Math.min(found - ti, 10);
    indices.push(found);
    ti = found + 1;
  }
  return { score: score - (indices[0] ?? 0), indices };
}
