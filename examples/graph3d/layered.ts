import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A layered directed graph in space (backlog G6): `arrangement: 'layered'` gives every node a
 * rank, as the 2D layered layout does, and makes each rank a plane; within its plane a node is
 * placed by the force layout, so linked nodes sit above one another. The planes are outlined, and
 * links are tubes with cones for arrowheads, which end on the spheres.
 *
 * The graph is a build pipeline: sources, compiled units, libraries, binaries, images and two
 * releases, each stage a group.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: layered graph in planes',
  description:
    'A directed pipeline with one plane per rank: nodes spread by the force layout within their plane, tube links with cone arrowheads.',
  tags: ['graph3d', 'graph', 'network', '3d', 'layered', 'dag', 'arrows'],
  size: { width: 760, height: 560 },
  testTolerance: 0.004,
};

const STAGES: readonly (readonly [string, number])[] = [
  ['Source', 9],
  ['Unit', 12],
  ['Library', 8],
  ['Binary', 5],
  ['Image', 3],
  ['Release', 2],
];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(5);
  const label: string[] = [];
  const group: string[] = [];
  const source: number[] = [];
  const target: number[] = [];
  let before: number[] = [];
  for (const [stage, count] of STAGES) {
    const here: number[] = [];
    for (let i = 0; i < count; i++) {
      here.push(label.length);
      label.push(`${stage} ${i + 1}`);
      group.push(stage);
    }
    // Every node of a stage feeds one or two nodes of the next, and every node is fed.
    for (const from of before) {
      const picks = new Set([Math.floor(random() * count)]);
      if (random() < 0.45) picks.add(Math.floor(random() * count));
      for (const k of picks) {
        source.push(from);
        target.push(here[k]!);
      }
    }
    here.forEach((to, k) => {
      if (before.length > 0 && !target.includes(to)) {
        source.push(before[k % before.length]!);
        target.push(to);
      }
    });
    before = here;
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        arrangement: 'layered',
        layered: { ranksep: 70 },
        node: { label, group, size: 12, textposition: 'none' },
        link: { source, target, width: 3, arrow: { end: true, size: 14 } },
      },
    ],
    layout: {
      title: { text: 'A build pipeline, one plane per stage' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
      // A lower view than the default, across the planes.
      scene: { camera: { eye: { x: 1.08, y: 0.74, z: 0.47 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
