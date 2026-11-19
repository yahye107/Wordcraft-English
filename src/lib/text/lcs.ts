/** Lower-case word list, with curly apostrophes made straight so “don’t” and "don't" compare equal. */
export const wordList = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{M}'’-]+/gu) ?? []).map((w) => w.replace(/’/g, "'"));

/** Length of the longest common subsequence of two word lists. */
export function lcs(a: string[], b: string[]): number {
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = up;
    }
  }
  return prev[b.length];
}
