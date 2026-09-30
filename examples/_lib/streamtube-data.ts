/**
 * Deterministic vector fields on grids for the `streamtube` examples (plan E14.6): flattened
 * `x`, `y`, `z`, `u`, `v`, `w` columns, x varying fastest, as Plotly's streamtube takes them.
 */

export interface GridField {
  x: number[];
  y: number[];
  z: number[];
  u: number[];
  v: number[];
  w: number[];
}

type Vec3 = [number, number, number];

/** `n` evenly spaced values from `lo` to `hi`. */
export function linspace(n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

/** Sample `f` on the grid `xs × ys × zs` (x fastest). */
export function gridField(
  xs: readonly number[],
  ys: readonly number[],
  zs: readonly number[],
  f: (x: number, y: number, z: number) => Vec3,
): GridField {
  const out: GridField = { x: [], y: [], z: [], u: [], v: [], w: [] };
  for (const z of zs) {
    for (const y of ys) {
      for (const x of xs) {
        const [u, v, w] = f(x, y, z);
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        out.u.push(u);
        out.v.push(v);
        out.w.push(w);
      }
    }
  }
  return out;
}

/**
 * A tornado rising along y: a swirl around the y axis drawn inwards, faster near the axis and
 * speeding up with height, on a 7 × 9 × 7 grid over x, z ∈ [−2, 2], y ∈ [0, 4].
 */
export function tornado(): GridField {
  const xz = linspace(7, -2, 2);
  return gridField(xz, linspace(9, 0, 4), xz, (x, y, z) => {
    const r2 = x * x + z * z;
    const swirl = 1.6 / (0.6 + r2);
    return [-z * swirl - 0.25 * x, 0.6 + 0.15 * y, x * swirl - 0.25 * z];
  });
}

/** The Arnold–Beltrami–Childress flow on an `n`³ grid over [0, 2π]³. */
export function abcFlow(n = 16): GridField {
  const [A, B, C] = [1, Math.sqrt(2 / 3), Math.sqrt(1 / 3)];
  const t = linspace(n, 0, 2 * Math.PI);
  return gridField(t, t, t, (x, y, z) => [
    A * Math.sin(z) + C * Math.cos(y),
    B * Math.sin(x) + A * Math.cos(z),
    C * Math.sin(y) + B * Math.cos(x),
  ]);
}

/**
 * A source at `(−1, 0, 0)` and a sink at `(1, 0, 0)` (a dipole) plus a gentle drift along x, on
 * a 13 × 9 × 9 grid over [−2, 2] × [−1.5, 1.5]²: the flow leaves the source, bends around and
 * enters the sink, the divergence (and so the tube radius) largest near both.
 */
export function sourceSink(): GridField {
  const pole = (x: number, y: number, z: number, cx: number, s: number): Vec3 => {
    const d = [x - cx, y, z];
    const r2 = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]! + 0.15;
    const k = s / (r2 * Math.sqrt(r2));
    return [d[0]! * k, d[1]! * k, d[2]! * k];
  };
  return gridField(
    linspace(13, -2, 2),
    linspace(9, -1.5, 1.5),
    linspace(9, -1.5, 1.5),
    (x, y, z) => {
      const a = pole(x, y, z, -1, 1);
      const b = pole(x, y, z, 1, -1);
      return [a[0] + b[0] + 0.1, a[1] + b[1], a[2] + b[2]];
    },
  );
}

/** Points on a small circle of radius `r` around `(cx, cy, cz)` in the y–z plane. */
export function ringStarts(n: number, r: number, cx: number, cy = 0, cz = 0) {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[] };
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.x.push(cx);
    out.y.push(cy + r * Math.cos(a));
    out.z.push(cz + r * Math.sin(a));
  }
  return out;
}
