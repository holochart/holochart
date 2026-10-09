import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A graph of 100,000 nodes and 150,000 links at given positions (backlog G7's target: 100k nodes
 * drawn at 60 fps from given positions). All the nodes are one instanced draw call and all the
 * links another; a pan or a zoom sets a transform and uploads nothing. Level of detail draws the
 * nodes as dots of 1.5 px and the links faint while the graph is fitted to the plot, and brings
 * sizes, outlines, arrowheads and labels back on the way in. Hover finds nodes and links through
 * spatial indexes, so it does not slow down with the size.
 *
 * `?nodes=` and `?links=` change the size. `pnpm bench:gpu --only _dev/graph-100k` measures the
 * first draw and the pan and zoom sweeps on a real GPU.
 *
 * Not a visual test and not in the gallery: too heavy for software GL.
 */
export const meta: ExampleMeta = {
  title: 'Graph: 100,000 nodes at given positions',
  description:
    '100,000 nodes and 150,000 links at given positions, drawn with level of detail; for the GPU benchmark.',
  tags: ['dev', 'graph', 'network', 'preset', 'perf', 'large-data', 'no-visual-test'],
  size: { width: 800, height: 600 },
};

declare global {
  interface Window {
    __graphPerf?: { generateMs: number; firstDrawMs: number };
  }
}

/**
 * Nodes in clusters of 250 scattered over the plane, each linked to a node placed just before it
 * in its cluster; the remaining links join two clusters that are near each other.
 */
function network(nodes: number, links: number) {
  const random = rng(13);
  const size = 250;
  const clusters = Math.ceil(nodes / size);
  const side = Math.ceil(Math.sqrt(clusters));
  const x = new Float64Array(nodes);
  const y = new Float64Array(nodes);
  const group: string[] = new Array<string>(nodes);
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  let k = 0;
  for (let i = 0; i < nodes; i++) {
    const c = Math.floor(i / size);
    const m = i % size;
    // A sunflower disc around the cluster's place on a jittered grid.
    const cx = (c % side) + 0.5;
    const cy = Math.floor(c / side) + 0.5;
    const r = 0.42 * Math.sqrt((m + 0.5) / size);
    const a = m * 2.399963229728653 + c;
    x[i] = cx + r * Math.cos(a);
    y[i] = cy + r * Math.sin(a);
    group[i] = `Group ${(c % 10) + 1}`;
    if (m > 0 && k < links) {
      source[k] = i - 1 - Math.floor(random() * Math.min(m, 8));
      target[k++] = i;
    }
  }
  while (k < links) {
    const a = Math.floor(random() * clusters);
    const step = [1, -1, side, -side][Math.floor(random() * 4)]!;
    const b = Math.min(clusters - 1, Math.max(0, a + step));
    if (a === b) continue;
    source[k] = Math.min(nodes - 1, a * size + Math.floor(random() * size));
    target[k++] = Math.min(nodes - 1, b * size + Math.floor(random() * size));
  }
  return { x, y, group, source, target };
}

export function run(el: HTMLElement): ExampleHandle {
  const query = new URLSearchParams(window.location.search);
  const nodes = Number(query.get('nodes')) || 100_000;
  const links = Number(query.get('links')) || Math.round(nodes * 1.5);
  const t0 = performance.now();
  const net = network(nodes, links);
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: { x: net.x, y: net.y, group: net.group, size: 6, line: { width: 0.5 } },
        link: { source: net.source, target: net.target, width: 0.75, arrow: { end: true } },
        showlegend: false,
      },
    ],
    layout: {
      title: { text: `${nodes.toLocaleString('en-US')} nodes at given positions` },
      xaxis: { visible: false },
      yaxis: { visible: false, scaleanchor: 'x' },
      margin: { l: 10, r: 10, t: 50, b: 10 },
    },
  });
  const ready = chart.ready.then(() => {
    window.__graphPerf = { generateMs, firstDrawMs: performance.now() - t1 };
  });
  return {
    ready,
    renderer: chart.three.renderer,
    dispose: () => {
      delete window.__graphPerf;
      chart.destroy();
    },
  };
}
