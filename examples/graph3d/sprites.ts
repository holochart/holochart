import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Sprites and lines (backlog G6): the parts of a 3D graph that keep their px size at every
 * depth. `node.render: 'sprite'` draws flat markers that face the camera, as `scatter3d` does, so
 * they take a `node.symbol` and an outline (`node.line`), and a node far away is as large as a
 * near one. `link.render: 'line'` draws the links as lines of `link.width` px, which can be
 * dashed. The graph has two kinds of node, told apart by symbol as well as by color: six
 * projects (squares) and the thirty people (circles) who work on one or two of them.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: sprite nodes and dashed lines',
  description:
    'People and their projects as flat markers with a symbol per kind, linked by dotted lines.',
  tags: ['graph3d', 'graph', 'network', '3d', 'sprite', 'symbols', 'dash', 'bipartite'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

const PROJECTS = ['Atlas', 'Beacon', 'Comet', 'Delta', 'Ember', 'Flint'];
const PEOPLE = 30;

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(8);
  const label: string[] = [...PROJECTS];
  const group: string[] = PROJECTS.map(() => 'Project');
  const symbol: string[] = PROJECTS.map(() => 'square');
  const size: number[] = PROJECTS.map(() => 16);
  const source: number[] = [];
  const target: number[] = [];
  for (let p = 0; p < PEOPLE; p++) {
    const person = label.length;
    label.push(`P${p + 1}`);
    group.push('Person');
    symbol.push('circle');
    size.push(9);
    // Everyone has a project; one person in three has a second one.
    const first = p % PROJECTS.length;
    source.push(person);
    target.push(first);
    if (random() < 0.34) {
      source.push(person);
      target.push((first + 1 + Math.floor(random() * (PROJECTS.length - 1))) % PROJECTS.length);
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: { label, group, symbol, size, render: 'sprite', line: { width: 1.5 } },
        link: { source, target, render: 'line', width: 1.5, dash: 'dot' },
      },
    ],
    layout: {
      title: { text: 'People and their projects' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
