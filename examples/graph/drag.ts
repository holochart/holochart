import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { hubGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Dragging nodes (backlog G5). Press on a node and move it: with `force.simulate` the layout runs
 * while the node is held, so its neighbours give way. Where it is dropped it stays: the chart
 * restyles `node.x` / `node.y` of that node, which pins it (the ring), and `force.start` with the
 * picture on screen, so the figure is what you see. A double click on a pinned node lets it go
 * again. A press on empty space still pans, and a click on a node is still a click.
 *
 * Two hubs are pinned in the figure already, left and right. The example is ready when the
 * layout is at rest (no frame drawn for a while), so the visual test compares the settled picture.
 */
export const meta: ExampleMeta = {
  title: 'Graph: drag and pin nodes',
  description:
    'A force layout whose nodes can be dragged: the others give way, and a dropped node stays pinned until a double click.',
  tags: ['graph', 'network', 'force', 'drag', 'pinned', 'simulate', 'interaction'],
  size: { width: 700, height: 480 },
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
  const net = hubGraph(40, 1, 7);
  // The two nodes with the most links, held 130 layout units either side of the middle.
  const degree = net.label.map(() => 0);
  net.source.forEach((s, k) => {
    degree[s] = degree[s]! + 1;
    degree[net.target[k]!] = degree[net.target[k]!]! + 1;
  });
  const byDegree = degree.map((_, i) => i).sort((a, b) => degree[b]! - degree[a]! || a - b);
  const [left, right] = [byDegree[0]!, byDegree[1]!];
  const pin = (at: number): (number | null)[] =>
    net.label.map((_, i) => (i === left ? -at : i === right ? at : null));
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        force: { simulate: true, linkdistance: 34 },
        node: {
          label: net.label,
          x: pin(130),
          y: net.label.map((_, i) => (i === left || i === right ? 0 : null)),
          sizeby: 'degree',
          sizerange: [9, 22],
          textposition: 'none',
        },
        link: { source: net.source, target: net.target, width: 1.5 },
      },
    ],
    layout: {
      title: { text: 'Drag a node; double-click a ringed one to let it go' },
      dragmode: 'pan',
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => atRest(chart)),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
