import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Waterfall and funnel interaction playground (plan E12.4, E12.5, E20.4): a waterfall on the left
 * subplot and a funnel on the right, hover labels with the waterfall's change lines and the
 * funnel's percentages, hover events carrying `initial` / `delta` / `final` and the funnel
 * percentages, and legend clicks toggling each trace. Every chart event is logged to
 * `window.__interaction.events`, which tests/interaction/waterfall.spec.ts reads.
 *
 * The geometry is fixed (640×400 px, explicit margins and domains, fixed ranges) so the tests can
 * locate bars from the public figure.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Waterfall and funnel: hover and legend events',
  description:
    'A waterfall and a funnel with hover labels and legend toggling; events are logged to window.__interaction.',
  tags: ['waterfall', 'funnel', 'financial', 'interaction', 'legend', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'legendclick', 'restyle'] as const;

function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    return {
      points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        x: pt['x'],
        y: pt['y'],
        initial: pt['initial'],
        delta: pt['delta'],
        final: pt['final'],
        percentInitial: pt['percentInitial'],
        percentPrevious: pt['percentPrevious'],
        percentTotal: pt['percentTotal'],
      })),
    };
  }
  if (typeof p['curveNumber'] === 'number') return { curveNumber: p['curveNumber'] };
  return JSON.parse(JSON.stringify({ ...p, event: undefined })) as unknown;
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'waterfall',
        name: 'P&L',
        x: ['Sales', 'Services', 'Costs', 'Taxes', 'Net'],
        y: [60, 20, -40, -10, null],
        measure: ['relative', 'relative', 'relative', 'relative', 'total'],
      },
      {
        type: 'funnel',
        name: 'Funnel',
        y: ['Visits', 'Sign-ups', 'Orders'],
        x: [400, 200, 50],
        xaxis: 'x2',
        yaxis: 'y2',
      },
    ],
    layout: {
      margin: { l: 40, r: 20, t: 40, b: 40 },
      xaxis: { domain: [0, 0.45] },
      yaxis: { range: [0, 100] },
      xaxis2: { domain: [0.55, 1], anchor: 'y2', range: [-250, 250] },
      yaxis2: { anchor: 'x2' },
      hovermode: 'closest',
      showlegend: true,
      legend: { orientation: 'h', x: 0, y: 1, xanchor: 'left', yanchor: 'bottom' },
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
