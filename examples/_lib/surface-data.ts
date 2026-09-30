/**
 * Deterministic height fields for the `surface` examples (plan E14.3): closed-form functions sampled
 * on regular grids, so every example (and its visual baseline) is reproducible.
 */

/** MATLAB's `peaks`: two bumps and a pit over about [-3, 3]². */
export function peaks(x: number, y: number): number {
  return (
    3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (y + 1) ** 2) -
    10 * (x / 5 - x ** 3 - y ** 5) * Math.exp(-(x ** 2) - y ** 2) -
    Math.exp(-((x + 1) ** 2) - y ** 2) / 3
  );
}

/** A ripple: `sin(r) / r` damped, around the origin. */
export function ripple(x: number, y: number): number {
  const r = Math.hypot(x, y);
  return r < 1e-9 ? 1 : Math.sin(r) / r;
}

/** `n` values evenly spaced from `a` to `b`. */
export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/** `z[row][column] = f(x[column], y[row])`. */
export function sample(
  x: readonly number[],
  y: readonly number[],
  f: (x: number, y: number) => number,
): number[][] {
  return y.map((yv) => x.map((xv) => f(xv, yv)));
}
