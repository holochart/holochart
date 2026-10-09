import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Interaction playground for the `graph` trace (backlog G1): hover on nodes and links, zoom and
 * box selection on a small directed graph at whole-number positions. Every chart event is logged
 * to `window.__interaction.events`, which the Playwright interaction suite reads
 * (tests/interaction/graph.spec.ts).
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: graph',
  description:
    'Hover nodes and links, zoom and select on a six-node directed graph; events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'graph', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What the example exposes to the interaction tests. */
interface InteractionHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
}

const EVENTS = [
  'hover',
  'unhover',
  'click',
  'relayout',
  'selecting',
  'selected',
  'deselect',
] as const;

/** Keep what tests assert on (points without their trace objects) so payloads stay small. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return payload;
  const end = (v: unknown): unknown => (v as { label?: unknown } | undefined)?.label;
  return {
    ...p,
    event: undefined,
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      kind: pt['kind'],
      label: pt['label'],
      degree: pt['degree'],
      source: end(pt['source']),
      target: end(pt['target']),
      value: pt['value'],
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
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'graph',
        name: 'net',
        node: {
          label: NODES.map((n) => n[0]),
          x: NODES.map((n) => n[1]),
          y: NODES.map((n) => n[2]),
          size: 18,
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
    },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: summarize(payload) });
    });
  }
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
