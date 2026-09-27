import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel area interaction playground (plan E12.6, E20.4): hover labels per stage from
 * `hoverinfo`, and the per-label legend (a click hides a stage by adding its label to
 * `layout.hiddenlabels`, and the others fill the funnel). Every chart event is logged to
 * `window.__interaction.events`, which tests/interaction/waterfall.spec.ts reads.
 *
 * The geometry is fixed so the tests can find stages from the public figure: 640×400 px, 20 px
 * margins, the funnel in `domain.x: [0, 0.6]` (a 360×360 px cell: half-width and half-height
 * 180 px around (200, 200)), explicit stage colors and a vertical legend right of it.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: hover and legend events',
  description:
    'Hover stages and click legend items to hide them; events are logged to window.__interaction.',
  tags: ['funnelarea', 'financial', 'interaction', 'legend', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['hover', 'unhover', 'click', 'legendclick', 'relayout'] as const;

function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    return {
      points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        label: pt['label'],
        value: pt['value'],
        percent: pt['percent'],
      })),
    };
  }
  if (typeof p['curveNumber'] === 'number')
    return { curveNumber: p['curveNumber'], label: p['label'] };
  return JSON.parse(JSON.stringify({ ...p, event: undefined })) as unknown;
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'funnelarea',
        name: 'Stages',
        labels: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        values: [40, 30, 20, 10],
        domain: { x: [0, 0.6], y: [0, 1] },
        textinfo: 'none',
        hoverinfo: 'label+value+percent',
        marker: { colors: ['#ea2a37', '#5e74d5', '#118e36', '#cc540a'] },
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: true,
      legend: { orientation: 'v', x: 0.7, y: 0.95, xanchor: 'left', yanchor: 'top' },
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
