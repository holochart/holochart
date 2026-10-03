import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Touch gestures, to try on a phone or tablet (or with the browser's device emulation): three
 * stacked charts, one per `touch-action` the chart picks from its `dragmode`, so page scrolling
 * over each of them can be tried too.
 *
 * - `dragmode: 'zoom'` (`touch-action: pan-y`): a swipe that starts vertically scrolls the page, a
 *   sideways one draws the zoom box; pinch zooms, two fingers pan, a tap hovers and clicks, a
 *   double tap resets.
 * - `dragmode: 'pan'` (`none`): every one-finger drag pans the chart.
 * - `dragmode: false` (`manipulation`): swipes and pinches are the page's; taps still hover.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: touch gestures and page scrolling',
  description:
    'Three stacked charts in zoom, pan and no-drag modes, to try pinch zoom, two-finger pan, taps and page scrolling on a touch screen.',
  tags: ['interaction', 'touch', 'dragmode', 'line', 'scatter'],
  size: { width: 640, height: 800 },
  testTolerance: 0.004,
};

const MODES = [
  ['zoom', "dragmode: 'zoom', vertical swipes scroll the page"],
  ['pan', "dragmode: 'pan', every swipe pans"],
  [false, 'dragmode: false, taps only'],
] as const;

/** Height of one chart and the gap between two, px: 3 × 256 + 2 × 16 = 800. */
const CHART_HEIGHT = 256;
const GAP = 16;

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 40 }, (_, i) => i / 4);
  const charts: Chart[] = MODES.map(([dragmode, title], k) => {
    const box = document.createElement('div');
    box.style.cssText = `height:${CHART_HEIGHT}px;margin-top:${k === 0 ? 0 : GAP}px;`;
    el.append(box);
    return createChart(box, {
      data: [
        {
          type: 'scatter',
          mode: 'lines+markers',
          x,
          y: x.map((v) => Math.sin(v) * 40 + v * 5),
          marker: { size: 8 },
          name: 'Signal',
        },
        {
          type: 'scatter',
          mode: 'markers',
          x,
          y: x.map((v, i) => Math.cos(v * 1.7) * 20 + v * 4 + (i % 3) * 6),
          marker: { size: 8 },
          name: 'Samples',
        },
      ],
      layout: { title: { text: title }, dragmode, showlegend: false },
      config: { responsive: true },
    });
  });
  return {
    ready: Promise.all(charts.map((c) => c.ready)).then(() => undefined),
    renderer: charts[0]?.three.renderer,
    dispose: () => {
      for (const c of charts) c.destroy();
      el.replaceChildren();
    },
  };
}
