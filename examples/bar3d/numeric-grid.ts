import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D bars on a numeric grid (plan E14.9): a bivariate histogram of 2 000 samples of two
 * correlated normal variables, counted on a 12 × 12 grid of 0.5-wide bins. The bars sit at the bin
 * centers on numeric x and y axes and fill 0.8 of the bin spacing by default; here `width` and
 * `depth` are set to 0.45 (in axis units) for narrower gaps. Bins without samples draw nothing.
 */
export const meta: ExampleMeta = {
  title: 'Bar3D: a numeric grid (3D histogram)',
  description: 'A bivariate histogram as 3D bars on numeric x/y axes.',
  tags: ['bar3d', '3d', 'bar', 'histogram', 'holochart-extension'],
  testTolerance: 0.004,
};

/** A deterministic normal sampler (Box–Muller over a linear congruential generator). */
function normals(n: number, seed: number): number[] {
  let s = seed;
  const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 4294967296;
  const out: number[] = [];
  while (out.length < n) {
    const r = Math.sqrt(-2 * Math.log(u()));
    const a = 2 * Math.PI * u();
    out.push(r * Math.cos(a), r * Math.sin(a));
  }
  return out.slice(0, n);
}

export function run(el: HTMLElement): ExampleHandle {
  const n = 2000;
  const a = normals(n, 7);
  const b = normals(n, 11);
  const bins = 12;
  const size = 0.5;
  const lo = -3;
  const counts = new Array<number>(bins * bins).fill(0);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = 0.6 * a[i]! + 0.8 * b[i]!;
    const cx = Math.floor((x - lo) / size);
    const cy = Math.floor((y - lo) / size);
    if (cx >= 0 && cx < bins && cy >= 0 && cy < bins) counts[cy * bins + cx]!++;
  }
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let j = 0; j < bins; j++) {
    for (let i = 0; i < bins; i++) {
      x.push(lo + (i + 0.5) * size);
      y.push(lo + (j + 0.5) * size);
      z.push(counts[j * bins + i]!);
    }
  }
  const chart = createChart(el, {
    data: [{ type: 'bar3d', name: 'samples', x, y, z, width: 0.45, depth: 0.45 }],
    layout: {
      title: { text: 'Bivariate histogram (2 000 samples)' },
      scene: {
        camera: { eye: { x: -1.5, y: -1.5, z: 1.0 } },
        aspectmode: 'manual',
        aspectratio: { x: 1, y: 1, z: 0.7 },
        zaxis: { title: { text: 'count' } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
