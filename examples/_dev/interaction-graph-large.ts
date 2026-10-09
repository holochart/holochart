import { createChart, type Chart, type Figure } from '@mk7s/holochart';
import { graphLayoutWorker } from '@mk7s/holochart/graph';
import { communityGraph, largeGraph } from '../_lib/graphs.ts';
import { clusteredNetwork } from '../_lib/networks.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Playground for large graphs (backlog G7): a `graph` trace whose layout runs off the main
 * thread and is drawn while it settles, the level of detail that follows the zoom, and bundled
 * links. The page starts with the figure the query string names and can be given another one
 * through `window.__interaction.show()`; the Playwright suite drives it that way
 * (tests/interaction/graph-large.spec.ts).
 *
 *   ?nodes=10000&links=50000   the size of the graph (default 10,000 and 50,000)
 *   ?arrangement=force         or `preset` (positions from a generator), `circular`
 *   ?worker=true|false|auto    the trace's `worker` (default `true`)
 *   ?bundle=hierarchical|force|auto
 *   ?lod=false                 the trace's `lod`
 *   ?arrows=1                  arrowheads
 *   ?idle=1                    start with an empty chart
 *
 * Not a visual test: what it draws depends on when it is looked at.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: large graph',
  description:
    'A 10,000-node force layout computed in the layout worker and drawn while it settles, with level of detail and link bundling; window.__interaction.show() draws another figure.',
  tags: ['dev', 'chart', 'interaction', 'graph', 'worker', 'perf', 'no-visual-test'],
  size: { width: 800, height: 600 },
};

/** What a figure of this page is made of. */
interface Ask {
  nodes?: number;
  links?: number;
  arrangement?: 'force' | 'preset' | 'circular' | 'layered';
  worker?: boolean | 'auto';
  bundle?: 'none' | 'auto' | 'hierarchical' | 'force';
  lod?: boolean | 'auto';
  arrows?: boolean;
  labels?: boolean;
  ticks?: number;
  simulate?: boolean;
  draggable?: boolean;
  staticPlot?: boolean;
  reducedMotion?: boolean;
}

interface InteractionHook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
  /** The figure for `ask`. */
  figure(ask: Ask): Figure;
  /**
   * Draw `ask` on the page's chart. Returns at once; `settled` turns `true` when the chart is
   * ready, and `longestBlock` is the longest gap between two turns of the event loop until then.
   */
  show(ask: Ask): void;
  settled: boolean;
  /** Animation frames between `show` and ready in which the chart was drawn. */
  drawn: number;
  longestBlock: number;
  /** Milliseconds from `show` to ready. */
  took: number;
  /** The positions of the page's chart as calc has them. */
  positions(): { x: number[]; y: number[]; pending: boolean };
  /** The positions of `ask` drawn on a chart of its own, which is destroyed again. */
  positionsOf(ask: Ask): Promise<{ x: number[]; y: number[] }>;
  /** Create a chart for `ask` in an element of its own and destroy it after `after` ms. */
  abandon(ask: Ask, after: number): Promise<void>;
  /** Requests the shared layout worker has not finished. */
  pending(): number;
  /** How many objects the trace draws (links, arrowheads, nodes, labels: one each). */
  objects(): number;
  warnings: string[];
}

const EVENTS = ['hover', 'unhover', 'click', 'selected', 'restyle', 'afterplot'] as const;

function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p['points'])) return undefined;
  const end = (v: unknown): unknown => (v as { index?: unknown } | undefined)?.index;
  return {
    points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
      pointNumber: pt['pointNumber'],
      kind: pt['kind'],
      label: pt['label'],
      source: end(pt['source']),
      target: end(pt['target']),
    })),
  };
}

function figure(ask: Ask): Figure {
  const nodes = ask.nodes ?? 10_000;
  const links = ask.links ?? 50_000;
  const arrangement = ask.arrangement ?? 'force';
  const node: Record<string, unknown> = { size: 6, line: { width: 0.5 } };
  let source: number[];
  let target: number[];
  if (arrangement === 'preset') {
    const clusters = Math.max(1, Math.round(Math.sqrt(nodes / 50)));
    const net = clusteredNetwork({
      seed: 3,
      clusters,
      perCluster: Math.ceil(nodes / clusters),
      between: Math.max(0, links - nodes),
    });
    Object.assign(node, { x: net.x, y: net.y, group: net.group, label: net.label });
    ({ source, target } = net);
  } else if (nodes <= 400) {
    const g = communityGraph({
      seed: 5,
      communities: 6,
      size: Math.ceil(nodes / 6),
      inside: Math.min(1, (links / nodes / (nodes / 6)) * 1.6),
      between: 0.004,
    });
    Object.assign(node, { group: g.group, label: g.label });
    ({ source, target } = g);
  } else {
    const g = largeGraph({ nodes, links, seed: 11 });
    Object.assign(node, { group: g.group, label: g.label });
    ({ source, target } = g);
  }
  if (ask.labels === false) delete node['label'];
  if (ask.draggable !== undefined) node['draggable'] = ask.draggable;
  return {
    data: [
      {
        type: 'graph',
        arrangement,
        ...(ask.worker !== undefined ? { worker: ask.worker } : { worker: true }),
        ...(ask.lod !== undefined ? { lod: ask.lod } : {}),
        ...(arrangement === 'force'
          ? {
              force: {
                ...(ask.ticks !== undefined ? { ticks: ask.ticks } : {}),
                ...(ask.simulate ? { simulate: true } : {}),
              },
            }
          : {}),
        node,
        link: {
          source,
          target,
          width: 0.75,
          ...(ask.arrows ? { arrow: { end: true } } : {}),
          ...(ask.bundle ? { bundle: { method: ask.bundle } } : {}),
        },
        showlegend: false,
      },
    ],
    layout: { margin: { l: 10, r: 10, t: 10, b: 10 }, width: 800, height: 600 },
    config: {
      ...(ask.staticPlot ? { staticPlot: true } : {}),
      ...(ask.reducedMotion !== undefined ? { a11y: { reducedMotion: ask.reducedMotion } } : {}),
    },
  };
}

const EMPTY: Figure = {
  data: [{ type: 'graph', node: { x: [0], y: [0] }, link: { source: [], target: [] } }],
  layout: { margin: { l: 10, r: 10, t: 10, b: 10 }, width: 800, height: 600 },
};

function queryAsk(): Ask | undefined {
  const q = new URLSearchParams(window.location.search);
  if (q.get('idle') === '1') return undefined;
  const number = (key: string): number | undefined =>
    q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : undefined;
  const flag = (key: string): boolean | 'auto' | undefined => {
    const v = q.get(key);
    return v === 'true' ? true : v === 'false' ? false : v === 'auto' ? 'auto' : undefined;
  };
  return {
    nodes: number('nodes'),
    links: number('links'),
    ticks: number('ticks'),
    arrangement: (q.get('arrangement') as Ask['arrangement']) ?? undefined,
    worker: flag('worker'),
    lod: flag('lod'),
    bundle: (q.get('bundle') as Ask['bundle']) ?? undefined,
    arrows: q.get('arrows') === '1',
    simulate: q.get('simulate') === '1',
  };
}

function positionsOf(chart: Chart): { x: number[]; y: number[]; pending: boolean } {
  const calc = chart.getCalcdata(0) as
    { x: Float64Array; y: Float64Array; pending?: unknown } | undefined;
  return {
    x: calc ? Array.from(calc.x) : [],
    y: calc ? Array.from(calc.y) : [],
    pending: calc?.pending !== undefined,
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const first = queryAsk();
  const chart = createChart(el, first ? figure(first) : EMPTY);
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
    warn.apply(console, args);
  };
  const hook: InteractionHook = {
    chart,
    events: [],
    figure,
    settled: false,
    drawn: 0,
    longestBlock: 0,
    took: 0,
    show(ask) {
      hook.settled = false;
      hook.longestBlock = 0;
      hook.drawn = 0;
      const started = performance.now();
      let last = started;
      const beat = setInterval(() => {
        const now = performance.now();
        hook.longestBlock = Math.max(hook.longestBlock, now - last);
        last = now;
      }, 4);
      // The render root resets the renderer's counters once for every frame it draws. (A figure
      // with another config gets a new renderer: the one in use is looked up frame by frame.)
      type Info = typeof chart.three.renderer.info;
      let watched: Info | undefined;
      let reset: Info['reset'] | undefined;
      const unwatch = (): void => {
        if (watched && reset) watched.reset = reset;
        watched = undefined;
      };
      const watch = (): void => {
        if (hook.settled || chart.destroyed) return unwatch();
        const { info } = chart.three.renderer;
        if (info !== watched) {
          unwatch();
          watched = info;
          const original = (reset = info.reset);
          info.reset = function (this: Info) {
            hook.drawn++;
            original.call(this);
          };
        }
        requestAnimationFrame(watch);
      };
      watch();
      void chart.react(figure(ask)).then(() => {
        clearInterval(beat);
        hook.took = performance.now() - started;
        hook.settled = true;
      });
    },
    positions: () => positionsOf(chart),
    async positionsOf(ask) {
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;';
      document.body.append(host);
      const other = createChart(host, figure(ask));
      await other.ready;
      const { x, y } = positionsOf(other);
      other.destroy();
      host.remove();
      return { x, y };
    },
    async abandon(ask, after) {
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;';
      document.body.append(host);
      const other = createChart(host, figure(ask));
      // Not ready yet: the layout is under way when the chart goes.
      await new Promise((resolve) => setTimeout(resolve, after));
      other.destroy();
      host.remove();
    },
    pending: () => graphLayoutWorker().pending,
    objects: () => chart.getTraceObjects(0).filter((o) => o.visible).length,
    warnings,
  };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: summarize(payload) });
    });
  }
  window.__interaction = hook;
  void chart.ready.then(() => {
    hook.settled = true;
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      console.warn = warn;
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
