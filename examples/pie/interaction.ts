import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Pie interaction playground (plan E9.11, E20.4): hover labels from a `hovertemplate`, slice
 * clicks, and the per-label legend (click hides a slice by adding its label to
 * `layout.hiddenlabels`, double-click isolates it). Every chart event is logged to
 * `window.__interaction.events`, which tests/interaction/pie.spec.ts reads.
 *
 * The geometry is fixed so the tests can find slices without internals: 640×400 px, 20 px
 * margins, the pie in `domain.x: [0, 0.6]` (a 360×360 px cell, so radius 180 px centered at
 * (200, 200)), `direction: 'clockwise'` from 12 o'clock, values already in descending order. The
 * legend sits inside the plot area right of the pie, so it pushes no margin, and the slice colors
 * are explicit so the tests can find legend glyphs by color.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Pie: hover, click and legend events',
  description:
    'Hover and click slices, click legend items to hide slices; events are logged to window.__interaction.',
  tags: ['pie', 'chart', 'interaction', 'legend', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = [
  'hover',
  'unhover',
  'click',
  'legendclick',
  'legenddoubleclick',
  'relayout',
] as const;

/**
 * Keep what tests assert on (Plotly-shaped pie points without their trace objects, and the legend
 * item of legend events) so payloads stay small and serializable.
 */
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
  if (typeof p['curveNumber'] === 'number') {
    return { curveNumber: p['curveNumber'], label: p['label'] };
  }
  return JSON.parse(JSON.stringify(p)) as unknown;
}

export function run(el: HTMLElement): ExampleHandle {
  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        type: 'pie',
        name: 'Share',
        labels: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'],
        values: [40, 25, 15, 12, 8],
        direction: 'clockwise',
        rotation: 0,
        domain: { x: [0, 0.6], y: [0, 1] },
        textinfo: 'none',
        marker: { colors: ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e'] },
        hovertemplate: '%{label}: %{value} (%{percent})<extra></extra>',
      },
    ],
    layout: {
      font: { family: 'Inter' },
      margin: { l: 20, r: 20, t: 20, b: 20 },
      paper_bgcolor: '#ffffff',
      showlegend: true,
      legend: { x: 0.7, y: 0.95, xanchor: 'left', yanchor: 'top' },
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
