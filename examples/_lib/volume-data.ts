/**
 * Deterministic scalar fields on grids for the `isosurface` and `volume` examples (plan E14.7,
 * E14.8): closed-form functions sampled on regular grids as Plotly takes them — flattened `x`, `y`,
 * `z` and `value` columns, x varying fastest — so every example (and its baseline) is reproducible.
 */

export interface ScalarGrid {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  value: Float32Array;
}

/** `n` evenly spaced values from `lo` to `hi`. */
export function linspace(n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

/** Sample `f` on the grid `xs × ys × zs` (x fastest), as float32 columns. */
export function scalarGrid(
  xs: readonly number[],
  ys: readonly number[],
  zs: readonly number[],
  f: (x: number, y: number, z: number) => number,
): ScalarGrid {
  const n = xs.length * ys.length * zs.length;
  const out: ScalarGrid = {
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    value: new Float32Array(n),
  };
  let o = 0;
  for (const z of zs) {
    for (const y of ys) {
      for (const x of xs) {
        out.x[o] = x;
        out.y[o] = y;
        out.z[o] = z;
        out.value[o++] = f(x, y, z);
      }
    }
  }
  return out;
}

/** The same grid on `[lo, hi]³` with `n` points per axis. */
export function cubeGrid(
  n: number,
  lo: number,
  hi: number,
  f: (x: number, y: number, z: number) => number,
): ScalarGrid {
  const a = linspace(n, lo, hi);
  return scalarGrid(a, a, a, f);
}

/** The gyroid: `sin x cos y + sin y cos z + sin z cos x` (a triply periodic minimal surface at 0). */
export function gyroid(x: number, y: number, z: number): number {
  return Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
}

/** Three Gaussian blobs of different sizes and heights (a density with nested shells). */
export function blobs(x: number, y: number, z: number): number {
  const g = (cx: number, cy: number, cz: number, s: number, a: number) =>
    a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (2 * s * s));
  return g(-0.35, -0.2, 0, 0.28, 1) + g(0.4, 0.25, 0.15, 0.2, 0.8) + g(0.05, 0.35, -0.4, 0.15, 0.6);
}

/** Plotly's volume example field: `sin(xyz) / (xyz)` (1 where the product is 0). */
export function sinc3(x: number, y: number, z: number): number {
  const p = x * y * z;
  return Math.abs(p) < 1e-12 ? 1 : Math.sin(p) / p;
}
