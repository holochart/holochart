import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Colors by value (backlog G1): numbers in `node.color` go through a colorscale, as scatter's
 * `marker.color` does, with `cmin` / `cmax`, `reversescale`, a shared `coloraxis` and a colorbar
 * (`node.showscale`). Here every node is colored by its distance from the center of the picture,
 * and the links take one color per link: darker inside a cluster than between clusters.
 */
export const meta: ExampleMeta = {
  title: 'Graph: node colors through a colorscale',
  description: 'Numeric node colors with a colorbar, and one color per link.',
  tags: ['graph', 'network', 'colorscale', 'colorbar'],
  size: { width: 720, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 11, clusters: 5, perCluster: 30, between: 12 });
  const distance = net.x.map((x, i) => Math.hypot(x, net.y[i]!));
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: {
          x: net.x,
          y: net.y,
          size: 10,
          color: distance,
          colorscale: 'Viridis',
          showscale: true,
          colorbar: { title: { text: 'Distance' }, thickness: 14 },
        },
        link: {
          source: net.source,
          target: net.target,
          color: net.source.map((s, k) =>
            net.group[s] === net.group[net.target[k]!]
              ? 'rgba(120, 120, 120, 0.55)'
              : 'rgba(214, 90, 60, 0.7)',
          ),
        },
      },
    ],
    layout: {
      title: { text: 'Colored by distance from the center' },
      xaxis: { visible: false },
      yaxis: { visible: false, scaleanchor: 'x' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
