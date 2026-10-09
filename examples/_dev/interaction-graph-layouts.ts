import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Interaction playground for the layouts of the `graph` trace (backlog G2, G4): what moves on the
 * chart. `?case=tree` (the default) is a small tree whose nodes fold and unfold on a click;
 * `?case=simulate` is a force layout shown settling (`force.simulate`), next to the same figure
 * without it, to compare where the two end. Chart events are logged to
 * `window.__interaction.events`, and the hook also counts the frames the chart drew and says
 * where the nodes are, for tests/interaction/graph-layouts.spec.ts.
 *
 * Not a visual test: its point is what happens over time, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: graph layouts',
  description:
    'A tree that folds on a click, or a force layout that settles on screen; events, frame counts and node positions are exposed on window.__interaction.',
  tags: ['dev', 'chart', 'interaction', 'graph', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What the layout cases add to the hook of the interaction examples. */
interface LayoutsHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  /** Frames the chart has drawn, and when it drew the last one (`performance.now()`). */
  frames: number;
  lastFrame: number;
  /** When the chart last emitted `restyle`. */
  lastRestyle: number;
  /** The same figure without `force.simulate`, in an element of its own (`?case=simulate`). */
  twin: Chart | undefined;
  /** Where calc put the nodes of trace 0 (linear coordinates), and which are not drawn. */
  nodes(chart?: Chart): { x: (number | null)[]; y: (number | null)[]; hidden: number[] };
  /** The first draw, again, in the same element. */
  restart(): Promise<void>;
}

const EVENTS = ['hover', 'unhover', 'click', 'restyle'] as const;

/** Keep what tests assert on (points without their trace objects) so payloads stay small. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return payload;
  return {
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      curveNumber: pt['curveNumber'],
      pointNumber: pt['pointNumber'],
      kind: pt['kind'],
      label: pt['label'],
    })),
  };
}

/** A root, three branches and their leaves; `ids` are the lower-case labels. */
const TREE = {
  ids: ['root', 'a', 'b', 'c', 'a1', 'a2', 'a3', 'b1', 'b2', 'c1'],
  labels: ['Root', 'A', 'B', 'C', 'A1', 'A2', 'A3', 'B1', 'B2', 'C1'],
  parents: ['', 'root', 'root', 'root', 'a', 'a', 'a', 'b', 'b', 'c'],
};

/** A ring of twelve nodes with three chords. */
const RING = {
  source: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 3, 6],
  target: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 6, 9, 10],
};

function figure(kind: string, simulate: boolean): Parameters<typeof createChart>[1] {
  if (kind === 'simulate') {
    return {
      data: [
        {
          type: 'graph',
          name: 'net',
          arrangement: 'force',
          force: { simulate },
          node: { size: 14 },
          link: { source: RING.source, target: RING.target, width: 2 },
        },
      ],
      layout: { margin: { l: 20, r: 20, t: 20, b: 20 } },
    };
  }
  return {
    data: [{ type: 'graph', name: 'tree', arrangement: 'tree', ...TREE, node: { size: 16 } }],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 } },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const kind = new URLSearchParams(location.search).get('case') ?? 'tree';
  const hook: LayoutsHook = {
    chart: undefined as unknown as Chart,
    events: [],
    frames: 0,
    lastFrame: 0,
    lastRestyle: 0,
    twin: undefined,
    nodes: (chart = hook.chart) => {
      const calc = chart.getCalcdata(0) as {
        x: Float64Array;
        y: Float64Array;
        hidden: Uint8Array;
      };
      const list = (values: Float64Array): (number | null)[] =>
        Array.from(values, (v) => (Number.isFinite(v) ? v : null));
      return { x: list(calc.x), y: list(calc.y), hidden: Array.from(calc.hidden) };
    },
    restart: async () => {
      hook.chart.destroy();
      start();
      await hook.chart.ready;
    },
  };
  let off: (() => void)[] = [];
  const start = (): void => {
    for (const stop of off) stop();
    const chart = createChart(el, figure(kind, true));
    hook.chart = chart;
    off = [
      chart.on('afterrender', () => {
        hook.frames++;
        hook.lastFrame = performance.now();
      }),
      ...EVENTS.map((name) =>
        chart.on(name, (payload: unknown) => {
          if (name === 'restyle') hook.lastRestyle = performance.now();
          hook.events.push({ name, payload: summarize(payload) });
        }),
      ),
    ];
  };
  start();

  let twinEl: HTMLDivElement | undefined;
  if (kind === 'simulate') {
    twinEl = document.createElement('div');
    twinEl.id = 'twin';
    twinEl.style.cssText = `width:${el.clientWidth}px;height:${el.clientHeight}px;`;
    el.after(twinEl);
    hook.twin = createChart(twinEl, figure(kind, false));
  }
  window.__interaction = hook;
  return {
    ready: Promise.all([hook.chart.ready, hook.twin?.ready]).then(() => undefined),
    renderer: hook.chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      for (const stop of off) stop();
      hook.chart.destroy();
      hook.twin?.destroy();
      twinEl?.remove();
    },
  };
}
