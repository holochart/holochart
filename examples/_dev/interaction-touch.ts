import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Touch playground (plan E6.6) for manual testing on a phone or tablet (or with the browser's
 * device emulation): three charts stacked taller than a phone screen, one per `touch-action` the
 * runtime picks, so page scrolling over them can be tried too.
 *
 * - `dragmode: 'zoom'` (`touch-action: pan-y`): a swipe that starts vertically scrolls the page, a
 *   sideways one draws the zoom box; pinch zooms, two fingers pan, a tap hovers and clicks, a
 *   double tap resets.
 * - `dragmode: 'pan'` (`none`): every one-finger drag pans the chart.
 * - `dragmode: false` (`manipulation`): swipes and pinches are the page's; taps still hover.
 *
 * The first chart's events are logged to `window.__interaction.events`. Not a visual test: its
 * point is the touch behavior, covered by `tests/interaction/touch.spec.ts`.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: touch',
  description:
    'Pinch zoom, two-finger pan, tap to hover and double-tap reset on three stacked charts in zoom, pan and no-drag modes, with page scrolling between them.',
  tags: ['dev', 'chart', 'interaction', 'touch', 'no-visual-test'],
  size: { width: 640, height: 1320 },
};

const MODES = [
  ['zoom', 'dragmode zoom: vertical swipes scroll the page'],
  ['pan', 'dragmode pan: every swipe pans'],
  [false, 'dragmode false: taps only'],
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 40 }, (_, i) => i / 4);
  const charts: Chart[] = MODES.map(([dragmode, title]) => {
    const box = document.createElement('div');
    box.style.cssText = 'width:100%;height:420px;margin-bottom:20px';
    el.append(box);
    return createChart(box, {
      data: [
        {
          type: 'scatter',
          mode: 'lines+markers',
          x,
          y: x.map((v) => Math.sin(v) * 40 + v * 5),
          marker: { size: 8 },
          name: 'signal',
        },
        {
          type: 'scatter',
          mode: 'markers',
          x,
          y: x.map((v, i) => Math.cos(v * 1.7) * 20 + v * 4 + (i % 3) * 6),
          marker: { size: 8 },
          name: 'samples',
        },
      ],
      layout: { title: { text: title }, dragmode, legend: { orientation: 'h', y: -0.15 } },
      config: { responsive: true },
    });
  });
  const hook: InteractionHook = { chart: charts[0] as Chart, events: [] };
  for (const name of ['hover', 'unhover', 'click', 'doubleclick', 'relayout'] as const) {
    hook.chart.on(name, (payload: unknown) => {
      const p = payload as { points?: { curveNumber: number; pointNumber: number }[] } | undefined;
      hook.events.push({
        name,
        payload: p?.points
          ? {
              points: p.points.map((q) => ({
                curveNumber: q.curveNumber,
                pointNumber: q.pointNumber,
              })),
            }
          : payload,
      });
    });
  }
  window.__interaction = hook;
  return {
    ready: Promise.all(charts.map((c) => c.ready)).then(() => undefined),
    renderer: hook.chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      for (const c of charts) c.destroy();
    },
  };
}
