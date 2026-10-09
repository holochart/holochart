import { createChart, register, toImage, type Chart, type Figure } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import { de } from '@mk7s/holochart-locales';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Keyboard and export playground for the `graph` trace (backlog G10): one small graph per kind of
 * arrangement, so that the Playwright suites can walk it with the arrow keys
 * (tests/interaction/keyboard-graph.spec.ts) and export it (tests/interaction/export-graph.spec.ts).
 *
 * `?graph=` picks the figure:
 *
 * - `network` (the default): six nodes at whole-number positions in two groups, A → B (5),
 *   B → C (1), D → E (3), A → D (2), and F without links. Around A, clockwise from 12 o'clock:
 *   D (up and to the right), then B (to the right).
 * - `tree`: a root with the children A and B, drawn from top to bottom; A has two leaves.
 * - `layered`: Load → Clean, Load → Enrich, Clean → Report, Enrich → Report, as boxes in three
 *   ranks from top to bottom, with a frame around each of its three groups.
 * - `force`: twelve nodes placed by the force layout and drawn while it settles
 *   (`force.simulate`).
 *
 * `locale=de` sets `config.locale`; `table=1` shows the data table
 * (`config.a11y.dataTable: 'visible'`). Chart events are logged to `window.__interaction.events`;
 * `window.__interaction.figure(name)` gives a variant's figure and `.toImage(figure)` exports one
 * at the size of the example.
 *
 * Not a visual test: its point is the keyboard behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Keyboard: graph',
  description:
    'Arrow keys along the links of a network, a tree and a layered graph; events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'graph', 'a11y', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What the example exposes to the interaction tests. */
interface GraphHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  figure(name: string): Figure;
  toImage(figure: Figure): Promise<string>;
}

const EVENTS = ['hover', 'unhover', 'click', 'relayout'] as const;

/** Keep what tests assert on (points without their trace objects) so payloads stay small. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return { keys: Object.keys(p) };
  const end = (v: unknown): unknown => (v as { label?: unknown } | undefined)?.label;
  return {
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      kind: pt['kind'],
      label: pt['label'],
      source: end(pt['source']),
      target: end(pt['target']),
    })),
  };
}

/** Label, group, x, y. */
const NODES: readonly (readonly [string, string, number, number])[] = [
  ['A', 'core', 0, 0],
  ['B', 'core', 2, 0],
  ['C', 'core', 4, 0],
  ['D', 'edge', 1, 2],
  ['E', 'edge', 3, 2],
  ['F', 'edge', 4, 2],
];

/** Source, target, value. */
const LINKS: readonly (readonly [number, number, number])[] = [
  [0, 1, 5],
  [1, 2, 1],
  [3, 4, 3],
  [0, 3, 2],
];

/** Twelve nodes: two triangles, a bridge between them and a tail. */
const FORCE_LINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [3, 4],
  [4, 5],
  [5, 3],
  [2, 3],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [1, 11],
];

const VARIANTS: Readonly<Record<string, () => Pick<Figure, 'data' | 'layout'>>> = {
  network: () => ({
    data: [
      {
        type: 'graph',
        name: 'net',
        arrangement: 'preset',
        node: {
          label: NODES.map((n) => n[0]),
          group: NODES.map((n) => n[1]),
          x: NODES.map((n) => n[2]),
          y: NODES.map((n) => n[3]),
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
    layout: { xaxis: { range: [-1, 5] }, yaxis: { range: [-1, 3] } },
  }),
  tree: () => ({
    data: [
      {
        type: 'graph',
        name: 'org',
        arrangement: 'tree',
        tree: { orientation: 'TB' },
        ids: ['r', 'a', 'b', 'a1', 'a2'],
        labels: ['Root', 'A', 'B', 'A one', 'A two'],
        parents: ['', 'r', 'r', 'a', 'a'],
        node: { size: 16 },
      },
    ],
    layout: {},
  }),
  layered: () => ({
    data: [
      {
        type: 'graph',
        name: 'pipeline',
        arrangement: 'layered',
        layered: { clusters: true },
        node: {
          label: ['Load', 'Clean', 'Enrich', 'Report'],
          group: ['source', 'work', 'work', 'sink'],
          shape: 'box',
        },
        link: { source: [0, 0, 1, 2], target: [1, 2, 3, 3], arrow: { end: true } },
      },
    ],
    layout: {},
  }),
  force: () => ({
    data: [
      {
        type: 'graph',
        name: 'mesh',
        arrangement: 'force',
        force: { simulate: true },
        node: { label: Array.from({ length: 12 }, (_, i) => `n${i}`), size: 14 },
        link: { source: FORCE_LINKS.map((l) => l[0]), target: FORCE_LINKS.map((l) => l[1]) },
      },
    ],
    layout: {},
  }),
};

export function run(el: HTMLElement): ExampleHandle {
  const query = new URLSearchParams(location.search);
  const locale = query.get('locale');
  if (locale === 'de') register(de);
  const config: Record<string, unknown> = {
    displayModeBar: false,
    ...(query.get('table') === '1' ? { a11y: { dataTable: 'visible' } } : {}),
    ...(locale === null ? {} : { locale }),
  };
  const figure = (name: string): Figure => {
    const variant = (VARIANTS[name] ?? VARIANTS['network']!)();
    return {
      data: variant.data,
      layout: { margin: { l: 20, r: 20, t: 20, b: 20 }, showlegend: false, ...variant.layout },
      config,
    } as Figure;
  };
  const chart = createChart(el, figure(query.get('graph') ?? 'network'));
  const hook: GraphHook = {
    chart,
    events: [],
    figure,
    toImage: (f) => toImage(f, { width: meta.size!.width, height: meta.size!.height }),
  };
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
