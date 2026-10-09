import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Force-directed link bundling (backlog G7): `link.bundle.method: 'force'`, for a graph without
 * groups. Links that run alongside each other attract each other, so a mass of crossing lines
 * becomes a few streams. The same graph is drawn twice, at the same positions: with straight
 * links on the left, bundled on the right.
 *
 * The graph is a map of routes: twelve places, the larger ones with many small ones around
 * them, and most links between the surroundings of two places. Nothing tells the trace which
 * links belong together; the bundling finds that from their directions, lengths and positions.
 * The bundles are computed after the nodes are placed (off the main thread with
 * `worker: 'auto'` and 1,000 links or more), so the links are straight for a moment first.
 */
export const meta: ExampleMeta = {
  title: 'Graph: force-directed link bundling',
  description: 'A hairball of routes between places, with straight links and bundled.',
  tags: ['graph', 'network', 'bundle', 'preset', 'subplots', 'large'],
  size: { width: 900, height: 480 },
  testTolerance: 0.004,
};

/** Places, each with a cloud of nodes around it, and routes between the clouds. */
function routes() {
  const random = rng(21);
  const x: number[] = [];
  const y: number[] = [];
  const first: number[] = [];
  const count: number[] = [];
  for (let p = 0; p < 12; p++) {
    const cx = 0.1 + 0.8 * random();
    const cy = 0.1 + 0.8 * random();
    const n = 6 + Math.floor(random() * 14);
    first.push(x.length);
    count.push(n);
    for (let i = 0; i < n; i++) {
      const r = 0.05 * Math.sqrt(random());
      const a = 2 * Math.PI * random();
      x.push(cx + r * Math.cos(a));
      y.push(cy + r * Math.sin(a));
    }
  }
  const source: number[] = [];
  const target: number[] = [];
  for (let k = 0; k < 420; k++) {
    const a = Math.floor(random() ** 1.5 * 12);
    let b = Math.floor(random() ** 1.5 * 12);
    if (b === a) b = (a + 1 + Math.floor(random() * 11)) % 12;
    source.push(first[a]! + Math.floor(random() * count[a]!));
    target.push(first[b]! + Math.floor(random() * count[b]!));
  }
  return { x, y, source, target };
}

export function run(el: HTMLElement): ExampleHandle {
  const net = routes();
  const node = { x: net.x, y: net.y, size: 5, color: '#e45756', line: { width: 0.5 } };
  const link = { source: net.source, target: net.target, width: 0.75 };
  const chart = createChart(el, {
    data: [
      { type: 'graph', node, link, hoverinfo: 'skip' },
      {
        type: 'graph',
        xaxis: 'x2',
        yaxis: 'y2',
        node,
        link: { ...link, bundle: { method: 'force' } },
      },
    ],
    layout: {
      title: { text: '420 routes between twelve places' },
      xaxis: { domain: [0, 0.48], visible: false },
      yaxis: { visible: false },
      xaxis2: { domain: [0.52, 1], visible: false },
      yaxis2: { anchor: 'x2', visible: false },
      annotations: [
        { text: 'straight links', x: 0.24, y: 0, showarrow: false },
        { text: "link.bundle.method: 'force'", x: 0.76, y: 0, showarrow: false },
      ].map((a) => ({ ...a, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'top' })),
      showlegend: false,
      margin: { l: 20, r: 20, t: 60, b: 40 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
