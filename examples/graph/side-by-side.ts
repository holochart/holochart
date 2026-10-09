import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { communityGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Two graphs in one figure (ADR-029). A `graph` trace is cartesian and has no `domain`: it is
 * placed by the domains of its axes, like any cartesian subplot. The second trace names a second
 * pair of axes (`xaxis: 'x2'`, `yaxis: 'y2'`), and `layout.xaxis.domain` / `layout.xaxis2.domain`
 * give each pair its half of the figure. Each pair is hidden and locked to one scale by its
 * graph, and zooms and pans on its own.
 *
 * Here the same network is drawn twice: placed by its links, and on a circle. The groups have
 * one legend, from the first trace; an item hides its group in both, since `layout.hiddenlabels`
 * is one list for the figure.
 */
export const meta: ExampleMeta = {
  title: 'Graph: two graphs side by side',
  description: 'One network in two arrangements, each on its own pair of axes.',
  tags: ['graph', 'network', 'subplots', 'domain', 'force', 'circular'],
  size: { width: 860, height: 460 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = communityGraph({ seed: 8, communities: 3, size: 11, inside: 0.32, between: 0.02 });
  const node = { label: net.label, group: net.group, size: 10 };
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        node,
        link: { source: net.source, target: net.target },
      },
      {
        type: 'graph',
        arrangement: 'circular',
        xaxis: 'x2',
        yaxis: 'y2',
        // The groups are in the legend once, from the first trace.
        showlegend: false,
        node,
        link: { source: net.source, target: net.target, curve: 0.12 },
      },
    ],
    layout: {
      title: { text: 'One network, two arrangements' },
      xaxis: { domain: [0, 0.48] },
      xaxis2: { domain: [0.52, 1] },
      yaxis2: { anchor: 'x2' },
      annotations: [
        { text: "arrangement: 'force'", x: 0.24, y: 0, showarrow: false },
        { text: "arrangement: 'circular'", x: 0.76, y: 0, showarrow: false },
      ].map((a) => ({ ...a, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'top' })),
      legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.02, yanchor: 'bottom' },
      margin: { l: 20, r: 20, t: 80, b: 40 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
