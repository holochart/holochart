/**
 * Numeric helpers of the force layout that keep it deterministic (ADR-029): a seeded generator in
 * place of `Math.random`, and roots computed with `+ − × ÷` and `Math.sqrt` only. Those five are
 * correctly rounded by IEEE 754, so they give the same bits on every engine; `Math.pow`,
 * `Math.cbrt`, `Math.sin` and `Math.cos` are not, and a last-bit difference in the cooling rate or
 * in a start position grows into a visibly different layout after a few hundred ticks.
 */

/**
 * A linear congruential generator (the Numerical Recipes constants, as d3-force uses): 32 bits of
 * state, values in `[0, 1)`. Only used to separate nodes that sit exactly on top of each other.
 */
export class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  }

  /** The next value in `[0, 1)`. */
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  /** A tiny non-zero offset, either sign: the direction two coincident nodes part in. */
  jiggle(): number {
    return (this.next() - 0.5) * 1e-6 || 1e-7;
  }
}

/** `base ** exponent` for a whole `exponent ≥ 0`, by squaring. */
function powInt(base: number, exponent: number): number {
  let result = 1;
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) result *= b;
    b *= b;
    e = Math.floor(e / 2);
  }
  return result;
}

/**
 * The `n`-th root of `a` for `0 < a ≤ 1` and a whole `n ≥ 1`, by Newton's method from 1 (the
 * iteration falls monotonically onto the root, so it stops when it no longer falls).
 */
export function nthRoot(a: number, n: number): number {
  if (n <= 1) return a;
  let y = 1;
  for (let k = 0; k < 500; k++) {
    const next = ((n - 1) * y + a / powInt(y, n - 1)) / n;
    if (!(next < y)) break;
    y = next;
  }
  return y;
}

/** The cube root of `v ≥ 0`, by Newton's method from `v ** ¼`. */
export function cubeRoot(v: number): number {
  if (!(v > 0)) return 0;
  let y = Math.sqrt(Math.sqrt(v));
  for (let k = 0; k < 100; k++) {
    const next = (2 * y + v / (y * y)) / 3;
    if (next === y) break;
    y = next;
  }
  return y;
}
