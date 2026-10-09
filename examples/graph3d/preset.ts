import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Given positions (backlog G6): with `node.x`, `node.y` and `node.z` for every node the
 * arrangement is `'preset'` and the positions are data on the scene's axes. This is the unit cell
 * of rock salt, repeated: sodium and chloride ions on a cubic lattice, each bonded to its six
 * neighbours. Ions are spheres in two sizes, bonds are tubes (`link.width` of 3 or more draws
 * tubes), and the scene's axes show the lattice coordinates.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: preset positions (a crystal lattice)',
  description:
    'Sodium and chloride ions at given x, y, z on the scene axes, bonded to their neighbours with tubes.',
  tags: ['graph3d', 'graph', 'network', '3d', 'preset', 'lattice', 'tubes'],
  size: { width: 720, height: 540 },
  testTolerance: 0.004,
};

/** A bond to the next ion along each axis. */
const BONDS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const n = 4;
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const group: string[] = [];
  const label: string[] = [];
  const size: number[] = [];
  const source: number[] = [];
  const target: number[] = [];
  const at = (i: number, j: number, k: number): number => (i * n + j) * n + k;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const sodium = (i + j + k) % 2 === 0;
        x.push(i);
        y.push(j);
        z.push(k);
        group.push(sodium ? 'Sodium' : 'Chloride');
        label.push(`${sodium ? 'Na' : 'Cl'} (${i}, ${j}, ${k})`);
        size.push(sodium ? 26 : 44);
        for (const [di, dj, dk] of BONDS) {
          if (i + di < n && j + dj < n && k + dk < n) {
            source.push(at(i, j, k));
            target.push(at(i + di, j + dj, k + dk));
          }
        }
      }
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: { x, y, z, group, label, size, textposition: 'none' },
        link: { source, target, width: 7, color: '#9aa3b2' },
      },
    ],
    layout: {
      title: { text: 'Rock salt: ions at given positions' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
      colorway: ['#b07cd8', '#58b368'],
      scene: {
        aspectmode: 'cube',
        camera: { eye: { x: 1.75, y: 1.45, z: 1.05 } },
        xaxis: { title: { text: 'a' }, dtick: 1 },
        yaxis: { title: { text: 'b' }, dtick: 1 },
        zaxis: { title: { text: 'c' }, dtick: 1 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
