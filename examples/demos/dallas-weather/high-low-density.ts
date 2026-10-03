import {
  createChart,
  type Chart,
  type Histogram2dTrace,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, HOT, N, TMAX, TMIN } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { suspectLow } from './wind-seasons.mts';

/**
 * Every day of the record as a point (its low, its high), counted in 2 °F cells and drawn as a
 * density map (`histogram2d` with explicit `xbins` / `ybins`; the `colorscale` is steep at the low
 * end, so cells with a few days still show). `shapes` add the diagonal where the high would equal
 * the low (no day can fall below it), the freezing line at a low of 32 °F and the line at a high
 * of 100 °F. One faulty low is left out (see `suspectLow`).
 *
 * Summer days bunch into a small bright patch near a low of 75 °F and a high in the mid 90s. The
 * rest of the year is a broad, much fainter band: cool-season days differ far more from one
 * another than summer days do.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: daily low against daily high',
  description:
    'Density map of the daily low and high temperature of every day at Dallas Love Field since 1939, in 2 °F bins, with the freezing and 100 °F lines.',
  tags: [
    'demo',
    'histogram2dcontour',
    'contour',
    'density',
    'statistical',
    'shapes',
    'annotations',
  ],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = 0; i < N; i++) {
    const hi = TMAX[i];
    const lo = TMIN[i];
    if (hi === null || lo === null || hi === undefined || lo === undefined) continue;
    // One faulty low (32 °F on a 94 °F day in June 2025) is left out.
    if (suspectLow(i)) continue;
    lows.push(lo);
    highs.push(hi);
  }
  const days = lows.length;
  const freezing = lows.filter((t) => t <= 32).length;
  const hundred = highs.filter((t) => t >= 100).length;
  // Whole even bounds around the data, so every 2 °F bin holds two whole-degree readings.
  const even = (v: number, up: boolean): number => (up ? Math.ceil(v / 2) : Math.floor(v / 2)) * 2;
  const x0 = even(Math.min(...lows), false) - 2;
  const x1 = even(Math.max(...lows), true) + 4;
  const y0 = even(Math.min(...highs), false) - 2;
  const y1 = even(Math.max(...highs), true) + 4;

  const density: Histogram2dTrace = {
    type: 'histogram2d',
    name: 'Days',
    x: lows,
    y: highs,
    xbins: { start: x0 - 0.5, end: x1 - 0.5, size: 2 },
    ybins: { start: y0 - 0.5, end: y1 - 0.5, size: 2 },
    zmin: 0,
    // Steep at the low end, so cells with a handful of days still show against the background.
    colorscale: [
      [0, LOOK.bg],
      [0.004, '#241d52'],
      [0.1, '#4b2a86'],
      [0.3, '#98308c'],
      [0.6, '#e0553a'],
      [1, '#f6e27a'],
    ],
    colorbar: { title: { text: 'Days per 2 °F cell', side: 'right' }, thickness: 12, len: 0.8 },
    hovertemplate:
      'Low near %{x:.0f} °F, high near %{y:.0f} °F<br><b>%{z:.0f} days</b><extra></extra>',
  };

  const dash = (color: string): LayoutShape['line'] => ({ color, width: 1.25, dash: 'dash' });
  const shapes: LayoutShape[] = [
    { type: 'line', x0: y0, y0, x1, y1: x1, line: dash(LOOK.text) },
    { type: 'line', x0: 32, x1: 32, y0, y1, line: dash(COLD) },
    { type: 'line', x0, x1, y0: 100, y1: 100, line: dash(HOT) },
  ];
  const share = (n: number): string => `${((n / days) * 100).toFixed(1)}%`;
  const annotations: LayoutAnnotation[] = [
    {
      x: 32,
      y: y1,
      xanchor: 'right',
      yanchor: 'top',
      xshift: -6,
      showarrow: false,
      align: 'right',
      text: `Low of 32 °F or less<br>${freezing.toLocaleString('en-US')} days (${share(freezing)})`,
      font: { size: 10, color: LOOK.title },
    },
    {
      x: x0,
      y: 100,
      xanchor: 'left',
      yanchor: 'bottom',
      xshift: 6,
      yshift: 2,
      showarrow: false,
      align: 'left',
      text: `High of 100 °F or more: ${hundred.toLocaleString('en-US')} days (${share(hundred)})`,
      font: { size: 10, color: LOOK.title },
    },
    {
      x: x1 - 4,
      y: x1 - 4,
      xanchor: 'left',
      yanchor: 'top',
      xshift: 6,
      showarrow: false,
      text: 'high = low',
      font: { size: 10, color: LOOK.text },
    },
  ];

  const chart: Chart = createChart(chartEl, {
    data: [density],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${days.toLocaleString('en-US')} days by their low and high: summer days bunch together, winter days spread out`,
      },
      hovermode: 'closest',
      xaxis: { title: { text: 'Low of the day (°F)' }, range: [x0, x1], dtick: 10 },
      yaxis: { title: { text: 'High of the day (°F)' }, range: [y0, y1], dtick: 10 },
      shapes,
      annotations,
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
