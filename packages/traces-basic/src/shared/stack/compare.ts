/**
 * Comparisons for cross-trace calcs (E7.2 / E16.3): a rerun of stacking reports only the traces
 * whose stacked output actually changed, so it compares what it produced with what it had.
 */

/**
 * Whether two numeric series hold the same values, elementwise (`NaN` equals `NaN`, so gaps
 * compare equal). The same array compares equal without a scan.
 */
export function sameValues(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const u = a[i] as number;
    const v = b[i] as number;
    if (u !== v && !(Number.isNaN(u) && Number.isNaN(v))) return false;
  }
  return true;
}
