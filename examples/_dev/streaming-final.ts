import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Deterministic streaming check for E7.2: three traces start with 60 points, then receive five
 * `extendTraces` batches with `maxPoints: 120` (a rolling window, so the first points scroll
 * out) and one `prependTraces` on the step trace, and render once at the end. The picture must
 * equal a chart drawn from the final data: straight lines with a gap across a batch boundary,
 * `hv` steps, and a spline whose last segment is re-tessellated on every append, plus markers and
 * an incrementally updated autorange.
 */
export const meta: ExampleMeta = {
  title: 'Streaming: final state',
  description:
    'Lines, steps and a spline after five rolling-window extendTraces batches and a prependTraces.',
  tags: ['dev', 'chart', 'streaming', 'scatter'],
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(21));
  const walk = (n: number, start: number, level: { v: number }): number[] =>
    Array.from({ length: n }, (_, i) => {
      level.v += normal() * 0.6;
      // A gap in the first series, straddling the second batch boundary.
      return start + i >= 85 && start + i < 89 && level === a ? NaN : level.v;
    });
  const a = { v: 10 };
  const b = { v: 0 };
  const c = { v: -10 };
  const xs = (n: number, start: number): Float64Array =>
    Float64Array.from({ length: n }, (_, i) => start + i);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines', name: 'lines', x: xs(60, 0), y: walk(60, 0, a) },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'steps',
        x: xs(60, 0),
        y: walk(60, 0, b),
        line: { shape: 'hv' },
        marker: { size: 4 },
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'spline',
        x: xs(60, 0),
        y: walk(60, 0, c).map((v, i) => (i % 3 === 0 ? v : v + 1)),
        line: { shape: 'spline' },
        marker: { size: 5, symbol: 'diamond' },
      },
    ],
    layout: {
      font: { family: 'Inter' },
      margin: { l: 48, r: 24, t: 24, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#e5ecf6',
      legend: { orientation: 'h', y: 1.08 },
    },
  });

  const stream = async (): Promise<void> => {
    await chart.ready;
    let next = 60;
    for (let batch = 0; batch < 5; batch++) {
      const n = 12 + batch * 3;
      await chart.extendTraces(
        {
          x: [xs(n, next), xs(n, next), xs(n, next)],
          y: [walk(n, next, a), walk(n, next, b), walk(n, next, c)],
        },
        [0, 1, 2],
        120,
      );
      next += n;
    }
    // Prepending to the step trace reaches back before its window, trimming its end instead.
    await chart.prependTraces({ x: [xs(5, 25)], y: [[-6, -5, -6, -7, -6]] }, [1], 120);
  };

  return {
    ready: stream(),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
