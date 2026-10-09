import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { smallWorld } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `force.simulate` (backlog G2): the chart shows the force layout settling. The nodes start in a
 * spiral and the simulation is drawn as it cools, a few steps per frame; hover and selection
 * follow the nodes while they move. The picture it ends on is the one the same figure gives
 * without `simulate`, and the axes are sized for it from the start, so nothing jumps. With
 * `prefers-reduced-motion` the settled layout is drawn at once.
 *
 * The example is ready when the layout is at rest (no frame drawn for a while), so the visual
 * test compares the settled picture.
 */
export const meta: ExampleMeta = {
  title: 'Graph: force layout, animated',
  description: 'A small-world graph that settles on screen with force.simulate.',
  tags: ['graph', 'network', 'force', 'animation', 'simulate'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

/**
 * Resolves once the chart has drawn nothing for `quiet` animation frames in a row (frames, not
 * ms: on a busy machine the simulation and this count slow down together).
 */
function atRest(chart: ReturnType<typeof createChart>, quiet = 30): Promise<void> {
  return new Promise((resolve) => {
    let drawn = 0;
    let seen = 0;
    let still = 0;
    const off = chart.on('afterrender', () => {
      drawn++;
    });
    const tick = (): void => {
      still = drawn === seen ? still + 1 : 0;
      seen = drawn;
      if (still < quiet && !chart.destroyed) {
        requestAnimationFrame(tick);
        return;
      }
      off();
      resolve();
    };
    requestAnimationFrame(tick);
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const net = smallWorld(48, 2, 0.12, 9);
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { simulate: true },
        node: { label: net.label, size: 12, textposition: 'none' },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'A ring with a few shortcuts, settling' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => atRest(chart)),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
