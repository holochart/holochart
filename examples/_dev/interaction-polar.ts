import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar interaction playground (plan E11.4, E20.4): hover labels, the radial drag (the handle past
 * the end of the radial axis), the angular drag (the band just outside the circle), the radial
 * zoom box (`dragmode: 'zoom'`), double-click reset and legend toggling. Every chart event is
 * logged to `window.__interaction.events`, which tests/interaction/polar.spec.ts reads.
 *
 * The geometry is fixed so the tests can find points without internals: 640×400 px, 20 px
 * margins, one polar subplot over the whole plot area (a 600×360 px domain, so the circle has
 * radius 180 px around (320, 200)), `radialaxis.range: [0, 10]` along 0°, angles counterclockwise
 * from 3 o'clock. The legend sits in the top-right corner, away from the drag handles.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: polar',
  description:
    'Hover, radial and angular drags, radial zoom box, double-click and legend on a polar subplot; events are logged to window.__interaction.',
  tags: ['dev', 'polar', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = [
  'hover',
  'unhover',
  'click',
  'doubleclick',
  'relayout',
  'relayouting',
  'legendclick',
] as const;

/** Keep what tests assert on (points without their trace objects). */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    return {
      points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        r: pt['r'],
        theta: pt['theta'],
      })),
    };
  }
  if (typeof p['curveNumber'] === 'number') return { curveNumber: p['curveNumber'] };
  return JSON.parse(JSON.stringify(p)) as unknown;
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatterpolar',
        name: 'A',
        mode: 'markers',
        r: [5, 8, 3, 6],
        theta: [45, 135, 225, 300],
        marker: { size: 10, color: '#ea2a37' },
      },
      {
        type: 'scatterpolar',
        name: 'B',
        mode: 'markers',
        r: [7, 2],
        theta: [90, 180],
        marker: { size: 10, color: '#5e74d5' },
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: true,
      legend: { orientation: 'v', x: 1, xanchor: 'right', y: 1, yanchor: 'top' },
      polar: { radialaxis: { range: [0, 10] } },
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
