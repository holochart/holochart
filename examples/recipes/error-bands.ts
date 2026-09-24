import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Continuous error bands (plan E9.7 recipe) without `fill`: area fills (`fill: 'tonexty'`, E9.4)
 * land in M2, so this recipe builds bands from what M1 has.
 *
 * - Model A: dense points with thick, opaque, capless `error_y` bars. Neighboring bars overlap, so
 *   they read as a solid band; error bars draw under the trace's own line. Use an opaque color:
 *   semi-transparent bars would darken where they overlap. Keep the stems wider than the point
 *   spacing in pixels (here 400 points and 5 px stems).
 * - Model B: the band's edges as two thin dashed lines around the mean.
 */
export const meta: ExampleMeta = {
  title: 'Recipe: continuous error bands',
  description:
    'A confidence band from dense, opaque, capless error bars under a line; and a band drawn as two bound lines.',
  tags: ['recipe', 'line', 'scatter', 'error-bars', 'band'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(71));
  const n = 400;
  const x = Array.from({ length: n }, (_, i) => (i / (n - 1)) * 12);
  // Model A: a smooth mean with an uncertainty that grows with x.
  const meanA = x.map((v) => 2 + Math.sin(v / 1.6) * 1.5 + v * 0.1);
  const sdA = x.map((v) => 0.25 + v * 0.06);
  // Model B: 25 sparse estimates with their interval.
  const xb = Array.from({ length: 25 }, (_, i) => i * 0.5);
  const meanB = xb.map((v) => 7 + Math.cos(v / 2) + normal() * 0.15);
  const sdB = xb.map(() => 0.6 + Math.abs(normal()) * 0.2);

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'model A ± 1 sd',
        x,
        y: meanA,
        line: { color: '#5e74d5', width: 1.5 },
        error_y: { type: 'data', array: sdA, width: 0, thickness: 5, color: '#202a4a' },
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'model B upper',
        x: xb,
        y: meanB.map((m, i) => m + sdB[i]!),
        line: { color: '#cc540a', width: 1, dash: 'dash' },
        legendgroup: 'b',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'model B lower',
        x: xb,
        y: meanB.map((m, i) => m - sdB[i]!),
        line: { color: '#cc540a', width: 1, dash: 'dash' },
        legendgroup: 'b',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'model B ± 1 sd',
        x: xb,
        y: meanB,
        line: { color: '#cc540a', width: 1.5 },
        marker: { size: 5 },
        legendgroup: 'b',
      },
    ],
    layout: {
      xaxis: { zeroline: false },
      yaxis: { zeroline: false },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
