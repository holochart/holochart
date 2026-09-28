import { createChart, type Chart } from '@mk7s/holochart';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Treemap drill-down playground (plan E13.3, E20.4): hover tiles (outlined), click one to drill into
 * it (an animated zoom, `level` set by a GUI restyle), click the entry's header or the path bar to
 * go back up; a `treemapclick` or `click` listener returning `false` cancels the drill. Every chart
 * event is logged to `window.__interaction.events`, which tests/interaction/treemap.spec.ts reads.
 *
 * The geometry is fixed so the tests can find tiles from the public figure: 640×400 px, 20 px
 * margins (a 600×360 px domain at (20, 20)), `dice` packing without gaps, 20 px header bands and
 * no other padding, and `total` values: Eve 60 = Seth 30 (Enos 20, Noam 10) + Cain 15 + Awan 9
 * (Enoch 9) + Abel 6, so the first level spans x 20–320, 320–470, 470–560 and 560–620 below Eve's
 * header (y 20–40), and the second level starts at y 60. Explicit colors switch depth fade off; the
 * path bar (18 px) sits at y 0–18 once drilled in.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: treemap drill-down',
  description:
    'Hover tiles, click to drill in and click the header or path bar to go up, with an animated transition; events are logged to window.__interaction.',
  tags: ['dev', 'treemap', 'hierarchical', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'treemapclick', 'icicleclick', 'restyle'] as const;

/** Keep what tests assert on (points without their trace objects). */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    const keys = [
      'curveNumber',
      'pointNumber',
      'label',
      'value',
      'id',
      'parent',
      'currentPath',
      'entry',
      'root',
      'percentParent',
      'percentEntry',
      'percentRoot',
    ];
    return {
      ...(p['nextLevel'] !== undefined ? { nextLevel: p['nextLevel'] } : {}),
      points: (p['points'] as Record<string, unknown>[]).map((pt) =>
        Object.fromEntries(keys.filter((k) => pt[k] !== undefined).map((k) => [k, pt[k]])),
      ),
    };
  }
  return JSON.parse(JSON.stringify(p)) as unknown;
}

/** Log a hierarchy chart's events to `window.__interaction` (shared with the icicle example). */
export function logHierarchyEvents(chart: Chart): ExampleHandle {
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

/** The family tree both hierarchy playgrounds draw (`branchvalues: 'total'`). */
export const TREE = {
  labels: ['Eve', 'Seth', 'Cain', 'Awan', 'Abel', 'Enos', 'Noam', 'Enoch'],
  parents: ['', 'Eve', 'Eve', 'Eve', 'Eve', 'Seth', 'Seth', 'Awan'],
  values: [60, 30, 15, 9, 6, 20, 10, 9],
  branchvalues: 'total',
  marker: { colors: ['#ffffff', '#5e74d5', '#ea2a37', '#118e36', '#cc540a'] },
  textinfo: 'label',
  hoverinfo: 'label+value+percent parent',
} as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'treemap',
        ...TREE,
        tiling: { packing: 'dice', pad: 0 },
        marker: { ...TREE.marker, pad: { t: 20, l: 0, r: 0, b: 0 } },
      },
    ],
    layout: { margin: { l: 20, r: 20, t: 20, b: 20 } },
  });
  return logHierarchyEvents(chart);
}
