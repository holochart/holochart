import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A camera that orbits a graph (backlog G6, plan E7.5): the scene is the one every 3D trace is
 * drawn in, so its camera animations work as they are. The chart first flies half way around the
 * network (`chart.animateCamera`, which orbits rather than cutting through), then the scene keeps
 * turning about z at 12° per second (`scene.autorotate`) until the pointer takes over. Node
 * colors come from a colorscale over the number of links, with a colorbar, and node labels are
 * culled again whenever the camera comes to rest.
 *
 * Not a visual test: the picture moves.
 */
export const meta: ExampleMeta = {
  title: 'Graph 3D: orbiting camera',
  description:
    'A flight half way around the network with chart.animateCamera, then scene.autorotate keeps it turning; nodes colored by degree through a colorscale.',
  tags: ['graph3d', 'graph', 'network', '3d', 'camera', 'animation', 'no-visual-test'],
  size: { width: 760, height: 520 },
};

export function run(el: HTMLElement): ExampleHandle {
  const net = clusteredNetwork({ seed: 21, clusters: 4, perCluster: 40, between: 18 });
  const degree = net.label.map(() => 0);
  net.source.forEach((s, k) => {
    degree[s]!++;
    degree[net.target[k]!]!++;
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'graph3d',
        node: {
          label: net.label,
          color: degree,
          colorscale: 'Portland',
          showscale: true,
          colorbar: { title: { text: 'Links' }, thickness: 14, len: 0.6 },
          sizeby: 'degree',
          sizerange: [8, 24],
        },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'An orbiting camera' },
      margin: { l: 0, r: 0, t: 50, b: 0 },
      scene: { camera: { eye: { x: 1.1, y: 1.1, z: 0.6 } } },
    },
  });
  void chart
    .animateCamera({ eye: { x: -1.1, y: -1.1, z: 0.6 } }, { duration: 3000 })
    .then(() => chart.relayout({ 'scene.autorotate': { speed: 12, axis: 'z' } }))
    // Interrupted by a drag, or the chart is gone: nothing to do.
    .catch(() => undefined);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
