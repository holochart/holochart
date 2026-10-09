import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { graphPath } from '@mk7s/holochart/graph';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The path between two nodes (backlog G5). While exactly two nodes are selected, the chart
 * highlights a shortest path between them and dims the rest. Here a path is short when its
 * `link.value` adds up to little (`highlight.pathweight: 'value'`: minutes on the road), not when
 * it has few links, and it is drawn in `highlight.color`. `graphPath(chart.fullData[0])` returns
 * the path that is highlighted: its nodes, its links and its length, which the title reports.
 *
 * Click a town to select it and shift-click another (`clickmode: 'event+select'`), or draw a box
 * around two; `highlight.path: [from, to]` does the same from the figure, whatever is selected.
 */
export const meta: ExampleMeta = {
  title: 'Graph: shortest path between two nodes',
  description: 'Two selected nodes highlight the quickest route between them over weighted links.',
  tags: ['graph', 'network', 'path', 'selection', 'highlight', 'interaction'],
  size: { width: 760, height: 500 },
  testTolerance: 0.004,
};

const NAMES = [
  'Alder',
  'Birch',
  'Cedar',
  'Dunmore',
  'Elm Hill',
  'Fenwick',
  'Garth',
  'Holt',
  'Iden',
  'Juniper',
  'Kell',
  'Larch',
  'Marlow',
  'Nettle',
  'Oakham',
  'Pinner',
  'Quarry',
  'Rowan',
  'Sedge',
  'Thorn',
];

/** Towns on a jittered grid and roads between near ones; a road's value is its minutes. */
function roads(): {
  x: number[];
  y: number[];
  source: number[];
  target: number[];
  minutes: number[];
} {
  const random = rng(21);
  const x: number[] = [];
  const y: number[] = [];
  const columns = 5;
  NAMES.forEach((_, i) => {
    x.push((i % columns) * 10 + (random() - 0.5) * 6);
    y.push(Math.floor(i / columns) * 8 + (random() - 0.5) * 5);
  });
  const source: number[] = [];
  const target: number[] = [];
  const minutes: number[] = [];
  const road = (a: number, b: number): void => {
    // Some roads are slow: the quickest way is not always the one with the fewest towns.
    const speed = random() < 0.3 ? 0.35 : 1;
    source.push(a);
    target.push(b);
    minutes.push(Math.max(3, Math.round(Math.hypot(x[a]! - x[b]!, y[a]! - y[b]!) / speed)));
  };
  NAMES.forEach((_, i) => {
    const column = i % columns;
    if (column + 1 < columns && random() < 0.85) road(i, i + 1);
    if (i + columns < NAMES.length && random() < 0.8) road(i, i + columns);
    if (column + 1 < columns && i + columns + 1 < NAMES.length && random() < 0.3) {
      road(i, i + columns + 1);
    }
  });
  return { x, y, source, target, minutes };
}

export function run(el: HTMLElement): ExampleHandle {
  const map = roads();
  const from = 0;
  const to = NAMES.length - 1;
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        node: {
          label: NAMES,
          x: map.x,
          y: map.y,
          size: 12,
          // A map: the towns stay where they are, and a drag pans.
          draggable: false,
        },
        link: {
          source: map.source,
          target: map.target,
          value: map.minutes,
          width: 2,
          hovertemplate: '%{source.label} – %{target.label}<br>%{value} min<extra></extra>',
        },
        selectedpoints: [from, to],
        highlight: { pathweight: 'value', color: '#f5a524' },
      },
    ],
    layout: {
      title: { text: 'The quickest route' },
      xaxis: { visible: false },
      yaxis: { visible: false },
      clickmode: 'event+select',
      dragmode: 'pan',
      margin: { l: 20, r: 20, t: 60, b: 20 },
    },
  });
  /** Say which route is highlighted, if any. */
  const report = (): Promise<unknown> => {
    const trace = chart.fullData[0];
    const path = trace ? graphPath(trace) : undefined;
    const text = path
      ? `${NAMES[path.nodes[0]!]} to ${NAMES[path.nodes.at(-1)!]}: ${path.length} min through ${path.links.length} roads`
      : 'Select two towns (click, then shift-click)';
    return chart.relayout({ 'title.text': text });
  };
  const off = [chart.on('selected', report), chart.on('deselect', report)];
  return {
    ready: chart.ready.then(report).then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      for (const stop of off) stop();
      chart.destroy();
    },
  };
}
