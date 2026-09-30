import { gaussian, rng } from './rng.ts';

/**
 * Deterministic data for the `mesh3d` and `cone` examples (plan E14.4, E14.5): shapes with
 * explicit triangles, point clouds for `alphahull`, and vector fields.
 */

const PHI = (1 + Math.sqrt(5)) / 2;

/** An icosahedron: 12 vertices, 20 triangles (`i`, `j`, `k`). */
export const ICOSAHEDRON = {
  x: [-1, 1, -1, 1, 0, 0, 0, 0, PHI, PHI, -PHI, -PHI],
  y: [PHI, PHI, -PHI, -PHI, -1, 1, -1, 1, 0, 0, 0, 0],
  z: [0, 0, 0, 0, PHI, PHI, -PHI, -PHI, -1, 1, -1, 1],
  i: [0, 0, 0, 0, 0, 1, 5, 11, 10, 7, 3, 3, 3, 3, 3, 4, 2, 6, 8, 9],
  j: [11, 5, 1, 7, 10, 5, 11, 10, 7, 1, 9, 4, 2, 6, 8, 9, 4, 2, 6, 8],
  k: [5, 1, 7, 10, 11, 9, 4, 2, 6, 8, 4, 2, 6, 8, 9, 5, 11, 10, 7, 1],
};

export interface Mesh {
  x: number[];
  y: number[];
  z: number[];
  i: number[];
  j: number[];
  k: number[];
}

/**
 * A UV sphere of radius 1 (`rings` latitude bands, `segments` longitudes), with single poles, so
 * every triangle is valid and the vertex count stays small.
 */
export function uvSphere(rings = 8, segments = 12): Mesh {
  const m: Mesh = { x: [0], y: [0], z: [1], i: [], j: [], k: [] };
  for (let r = 1; r < rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * 2 * Math.PI;
      m.x.push(Math.sin(phi) * Math.cos(theta));
      m.y.push(Math.sin(phi) * Math.sin(theta));
      m.z.push(Math.cos(phi));
    }
  }
  m.x.push(0);
  m.y.push(0);
  m.z.push(-1);
  const south = m.x.length - 1;
  const at = (r: number, s: number) => 1 + (r - 1) * segments + (s % segments);
  const tri = (a: number, b: number, c: number) => {
    m.i.push(a);
    m.j.push(b);
    m.k.push(c);
  };
  for (let s = 0; s < segments; s++) {
    tri(0, at(1, s), at(1, s + 1));
    for (let r = 1; r < rings - 1; r++) {
      tri(at(r, s), at(r + 1, s), at(r + 1, s + 1));
      tri(at(r, s), at(r + 1, s + 1), at(r, s + 1));
    }
    tri(south, at(rings - 1, s + 1), at(rings - 1, s));
  }
  return m;
}

/** A hill-and-valley terrain sampled at `n` random points over [0, 10]². */
export function terrain(n = 300, seed = 3): { x: number[]; y: number[]; z: number[] } {
  const random = rng(seed);
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let p = 0; p < n; p++) {
    const u = random() * 10;
    const v = random() * 10;
    x.push(u);
    y.push(v);
    z.push(
      3 * Math.exp(-((u - 3) ** 2 + (v - 6) ** 2) / 6) +
        2 * Math.exp(-((u - 7) ** 2 + (v - 3) ** 2) / 4) -
        1.5 * Math.exp(-((u - 7) ** 2 + (v - 8) ** 2) / 3),
    );
  }
  return { x, y, z };
}

/** A Gaussian point cloud (`n` points, standard deviations `s`). */
export function cloud(n: number, s: [number, number, number], seed = 5) {
  const normal = gaussian(rng(seed));
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let p = 0; p < n; p++) {
    x.push(normal() * s[0]);
    y.push(normal() * s[1]);
    z.push(normal() * s[2]);
  }
  return { x, y, z };
}

/** `n` points uniformly inside a torus around the z axis (radii `R`, `r`). */
export function solidTorus(n: number, R: number, r: number, seed = 9) {
  const random = rng(seed);
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  while (x.length < n) {
    const px = (random() * 2 - 1) * (R + r);
    const py = (random() * 2 - 1) * (R + r);
    const pz = (random() * 2 - 1) * r;
    if ((Math.hypot(px, py) - R) ** 2 + pz * pz > r * r) continue;
    x.push(px);
    y.push(py);
    z.push(pz);
  }
  return { x, y, z };
}

/** A vector field sampled on a grid over `[−1, 1]² × [0, 1]` (`layers` z levels). */
export function field(
  n: number,
  layers: number,
  f: (x: number, y: number, z: number) => [number, number, number],
) {
  const out = { x: [] as number[], y: [] as number[], z: [] as number[] };
  const vec = { u: [] as number[], v: [] as number[], w: [] as number[] };
  for (let k = 0; k < layers; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        const y = (j / (n - 1)) * 2 - 1;
        const z = layers > 1 ? k / (layers - 1) : 0;
        const [u, v, w] = f(x, y, z);
        out.x.push(x);
        out.y.push(y);
        out.z.push(z);
        vec.u.push(u);
        vec.v.push(v);
        vec.w.push(w);
      }
    }
  }
  return { ...out, ...vec };
}

/** A vortex `(−y, x, 0.4 + 0.2 z)` on a 7 × 7 × 3 grid. */
export const vortex = () => field(7, 3, (x, y, z) => [-y, x, 0.4 + 0.2 * z]);
