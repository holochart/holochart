import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { graphPath } from '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Interaction playground for what the pointer does to a `graph` trace (backlog G5): hover
 * highlighting, node dragging and pinning, selection and the path between two selected nodes.
 * Chart events are logged to `window.__interaction.events`, and the hook says where the nodes
 * are and which path is highlighted, for tests/interaction/graph-interact.spec.ts.
 *
 * - `?case=preset` (the default): six nodes at whole-number positions (A, B, C on y = 0 at
 *   x = 0, 2, 4; D, E, F on y = 2 at x = 1, 3, 4) and five directed links (A → B, B → C, D → E,
 *   A → D, E → F), x in [-1, 5], y in [-1, 3]. Positions are data: a drag restyles them.
 * - `?case=force`: a ring of eight nodes with two chords under `arrangement: 'force'`, drawn at
 *   rest. A drag pins a node; a double click releases it.
 * - `?case=simulate`: the same with `force.simulate`: the other nodes give way while a node is
 *   dragged.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: graph highlighting and dragging',
  description:
    'Hover highlights, node drags, pins and the path between two selected nodes; events and node positions are exposed on window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'graph', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What the example exposes to the interaction tests. */
interface DragHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  /** Frames the chart has drawn, and when it drew the last one (`performance.now()`). */
  frames: number;
  lastFrame: number;
  /** Where calc put the nodes of trace 0 (linear coordinates). */
  nodes(): { x: (number | null)[]; y: (number | null)[] };
  /** The path trace 0 highlights (`graphPath`), `null` for none. */
  path(): unknown;
}

const EVENTS = [
  'hover',
  'unhover',
  'click',
  'doubleclick',
  'restyle',
  'relayout',
  'selecting',
  'selected',
  'deselect',
] as const;

/** Keep what tests assert on (points without their trace objects) so payloads stay small. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return JSON.parse(JSON.stringify(p)) as unknown;
  const end = (v: unknown): unknown => (v as { index?: unknown } | undefined)?.index;
  return {
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      kind: pt['kind'],
      label: pt['label'],
      neighbors: pt['neighbors'],
      source: end(pt['source']),
      target: end(pt['target']),
      links: pt['links'],
      path: pt['path'],
    })),
  };
}

/** Label, x, y. */
const NODES: readonly (readonly [string, number, number])[] = [
  ['A', 0, 0],
  ['B', 2, 0],
  ['C', 4, 0],
  ['D', 1, 2],
  ['E', 3, 2],
  ['F', 4, 2],
];

/** Source, target, value. */
const LINKS: readonly (readonly [number, number, number])[] = [
  [0, 1, 5],
  [1, 2, 1],
  [3, 4, 3],
  [0, 3, 2],
  [4, 5, 1],
];

/** A ring of eight nodes with two chords. */
const RING = {
  source: [0, 1, 2, 3, 4, 5, 6, 7, 0, 2],
  target: [1, 2, 3, 4, 5, 6, 7, 0, 4, 6],
};

function figure(kind: string): Parameters<typeof createChart>[1] {
  if (kind === 'force' || kind === 'simulate') {
    return {
      data: [
        {
          type: 'graph',
          name: 'ring',
          arrangement: 'force',
          force: { simulate: kind === 'simulate' },
          node: { size: 16, label: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], textposition: 'none' },
          link: { source: RING.source, target: RING.target, width: 2 },
        },
      ],
      layout: { margin: { l: 20, r: 20, t: 20, b: 20 }, dragmode: 'pan' },
    };
  }
  return {
    data: [
      {
        type: 'graph',
        name: 'net',
        node: {
          label: NODES.map((n) => n[0]),
          x: NODES.map((n) => n[1]),
          y: NODES.map((n) => n[2]),
          size: 18,
          textposition: 'none',
        },
        link: {
          source: LINKS.map((l) => l[0]),
          target: LINKS.map((l) => l[1]),
          value: LINKS.map((l) => l[2]),
          width: 2,
          arrow: { end: true },
        },
      },
    ],
    layout: {
      xaxis: { range: [-1, 5] },
      yaxis: { range: [-1, 3] },
      showlegend: false,
      plot_bgcolor: '#ffffff',
      paper_bgcolor: '#ffffff',
    },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const kind = new URLSearchParams(location.search).get('case') ?? 'preset';
  const chart = createChart(el, figure(kind));
  const hook: DragHook = {
    chart,
    events: [],
    frames: 0,
    lastFrame: 0,
    nodes: () => {
      const calc = chart.getCalcdata(0) as { x: Float64Array; y: Float64Array };
      const list = (values: Float64Array): (number | null)[] =>
        Array.from(values, (v) => (Number.isFinite(v) ? v : null));
      return { x: list(calc.x), y: list(calc.y) };
    },
    path: () => {
      const trace = chart.fullData[0];
      return (trace ? graphPath(trace) : undefined) ?? null;
    },
  };
  const off = [
    chart.on('afterrender', () => {
      hook.frames++;
      hook.lastFrame = performance.now();
    }),
    ...EVENTS.map((name) =>
      chart.on(name, (payload: unknown) => {
        hook.events.push({ name, payload: summarize(payload) });
      }),
    ),
  ];
  (window as unknown as { __interaction?: unknown }).__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      const w = window as unknown as { __interaction?: unknown };
      if (w.__interaction === hook) delete w.__interaction;
      for (const stop of off) stop();
      chart.destroy();
    },
  };
}
