import Papa from "papaparse";

/**
 * `.random` files: plain CSV text. Every cell — across commas and lines — is
 * one entry in the draw, so `1,2,3,4,5,6,7` and `1,2,3,4` + `5,6,7` hold the
 * same seven values. Quoted cells keep their commas (`"Paris, FR"`). Blank
 * cells are skipped; duplicates stay (a repeated value is drawn more often).
 */
export function parseRandomValues(text: string): string[] {
  if (!text.trim()) return [];
  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  return data.flatMap((row) =>
    row.map((cell) => cell.trim()).filter((cell) => cell.length > 0),
  );
}

/** Uniform integer in [0, max) from the platform CSPRNG. */
function randomIndex(max: number) {
  // Rejection sampling keeps the draw unbiased for any `max`.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

/**
 * `count` distinct positions out of `total` (no position twice), in draw
 * order — a partial Fisher–Yates shuffle.
 */
export function drawIndices(total: number, count: number): number[] {
  const n = Math.max(0, Math.min(count, total));
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + randomIndex(total - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Starter for a new `.random` file. */
export const RANDOM_STARTER = `Ada,Grace,Linus,Margaret
Alan,Katherine,Dennis,Barbara
`;
