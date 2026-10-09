import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A network on data axes (backlog G1): with `arrangement: 'preset'` the node positions are data,
 * so they go through the axis scales like any trace's. Here the x axis is a date axis and the y
 * axis is logarithmic: the scatter trace is a product's weekly active users, and the graph on
 * the same axes links the releases that built on each other. Zooming and panning move both.
 */
export const meta: ExampleMeta = {
  title: 'Graph: a network over a scatter trace, on a date and a log axis',
  description: 'Releases linked by what they built on, drawn over a time series.',
  tags: ['graph', 'network', 'preset', 'date', 'log', 'scatter'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

const WEEKS = 40;
const dates: string[] = [];
const users: number[] = [];
for (let w = 0; w < WEEKS; w++) {
  dates.push(new Date(Date.UTC(2025, 0, 6 + 7 * w)).toISOString().slice(0, 10));
  users.push(Math.round(900 * Math.exp(0.085 * w) * (1 + 0.12 * Math.sin(w * 1.7))));
}

/** Name, week, and the releases it built on. */
const RELEASES: readonly (readonly [string, number, readonly number[]])[] = [
  ['1.0', 2, []],
  ['1.1 sync', 8, [0]],
  ['1.2 sharing', 13, [0]],
  ['2.0', 20, [1, 2]],
  ['2.1 mobile', 27, [3]],
  ['2.2 teams', 31, [3, 2]],
  ['3.0', 37, [4, 5]],
];

export function run(el: HTMLElement): ExampleHandle {
  const source: number[] = [];
  const target: number[] = [];
  RELEASES.forEach(([, , builtOn], i) => {
    for (const from of builtOn) {
      source.push(from);
      target.push(i);
    }
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Weekly active users',
        x: dates,
        y: users,
        line: { color: '#9ecae1', width: 2 },
      },
      {
        type: 'graph',
        name: 'Releases',
        node: {
          label: RELEASES.map((r) => r[0]),
          x: RELEASES.map((r) => dates[r[1]]!),
          // Off the line by a factor, which is a constant distance on a log axis: major
          // releases above it, the others below.
          y: RELEASES.map((r) => users[r[1]]! * (r[0].length === 3 ? 2.4 : 0.42)),
          size: 13,
          color: '#e6550d',
        },
        link: { source, target, arrow: { end: true }, color: 'rgba(230, 85, 13, 0.6)', width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'Releases and usage' },
      yaxis: { type: 'log', title: { text: 'Users' } },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
