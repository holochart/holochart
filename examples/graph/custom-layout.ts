import { createChart } from '@mk7s/holochart';
import { registerGraphLayout, type GraphLayout } from '@mk7s/holochart/graph';
import { hubGraph } from '../_lib/graphs.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A layout of your own (ADR-029): `registerGraphLayout(name, layout)` adds a layout, and
 * `arrangement: 'custom'` with `custom.name` runs it. A layout is a function from the graph as
 * typed arrays (the node count, `source` and `target` per link, the nodes' half extents) to one
 * position per node, in layout units; the trace fits the result to the plot area. It gets
 * `custom.options` as its second argument.
 *
 * This one is a sunflower: the nodes in order of their number of links along a spiral that fills
 * a disc evenly, the most linked in the middle. It shows the core of a graph and its rim without
 * simulating anything.
 */
export const meta: ExampleMeta = {
  title: 'Graph: custom layout',
  description:
    'A layout registered with registerGraphLayout: a spiral with the most linked nodes in the middle.',
  tags: ['graph', 'network', 'custom', 'layout', 'registerGraphLayout'],
  size: { width: 680, height: 560 },
  testTolerance: 0.004,
};

interface SunflowerOptions {
  /** Distance between two neighbours on the spiral, about, in layout units. */
  spacing: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** The nodes on a sunflower spiral, most links first. Deterministic: ties go by index. */
const sunflower: GraphLayout<SunflowerOptions> = (graph, options) => {
  const degree = new Int32Array(graph.nodes);
  for (let k = 0; k < graph.source.length; k++) {
    degree[graph.source[k]!]!++;
    degree[graph.target[k]!]!++;
  }
  const order = Array.from(degree.keys()).sort((a, b) => degree[b]! - degree[a]! || a - b);
  const x = new Float64Array(graph.nodes);
  const y = new Float64Array(graph.nodes);
  order.forEach((node, k) => {
    const radius = options.spacing * Math.sqrt(k);
    x[node] = radius * Math.cos(k * GOLDEN_ANGLE);
    y[node] = radius * Math.sin(k * GOLDEN_ANGLE);
  });
  return { x, y };
};

export function run(el: HTMLElement): ExampleHandle {
  // Under a name of this example's own: the table of layouts is shared by every chart of a page.
  // Registering a name again replaces the layout, so running the example twice is harmless.
  registerGraphLayout('example-sunflower', sunflower);
  const net = hubGraph(140, 1, 6);
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        arrangement: 'custom',
        custom: { name: 'example-sunflower', options: { spacing: 30 } },
        node: {
          label: net.label,
          sizeby: 'degree',
          sizerange: [5, 22],
          textposition: 'none',
        },
        link: { source: net.source, target: net.target },
      },
    ],
    layout: {
      title: { text: 'The most linked nodes in the middle' },
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
