import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { largeGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A force-directed graph of 10,000 nodes and 50,000 links (backlog G7), laid out off the main
 * thread: `worker: 'auto'` sends a `force` layout to the package's layout worker from 1,000
 * nodes. The chart is drawn at once, the nodes move to their places as the worker reports them,
 * and the page stays responsive throughout; `chart.ready` resolves when the layout has arrived,
 * with the same positions a layout on the main thread gives. Without a worker (a Content
 * Security Policy, a bundler that left the file out) the same code runs on the main thread in
 * slices, with one warning.
 *
 * Level of detail keeps a graph this size readable and fast (`lod: 'auto'`, from 3,000 nodes or
 * 5,000 links): the nodes are drawn smaller and without outlines while they are dense, the links
 * fade as they cover the plot, and labels come back on a zoom, when the nodes are 24 px apart.
 * Zoom into a community to see them.
 *
 * `pnpm bench:gpu --only graph/large-10k` measures the layout and a pan on a real GPU.
 */
export const meta: ExampleMeta = {
  title: 'Graph: 10,000 nodes, laid out in a worker',
  description:
    'A force layout of 10,000 nodes and 50,000 links computed off the main thread and drawn while it settles, with level of detail.',
  tags: ['graph', 'network', 'force', 'worker', 'perf', 'large-data', 'no-visual-test'],
  size: { width: 800, height: 600 },
};

declare global {
  interface Window {
    __graphPerf?: { generateMs: number; firstDrawMs: number };
  }
}

export function run(el: HTMLElement): ExampleHandle {
  const t0 = performance.now();
  const net = largeGraph({ nodes: 10_000, links: 50_000, communities: 12, seed: 11 });
  const generateMs = performance.now() - t0;
  const t1 = performance.now();
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'force',
        worker: 'auto',
        node: { label: net.label, group: net.group, size: 6, line: { width: 0.5 } },
        link: { source: net.source, target: net.target, width: 0.75 },
        showlegend: false,
      },
    ],
    layout: {
      title: { text: '10,000 nodes and 50,000 links in twelve communities' },
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
