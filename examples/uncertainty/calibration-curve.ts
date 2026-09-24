import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A lab calibration curve with uncertainty on both axes:
 *
 * - Standards: replicate spread as `error_y` (`type: 'data'`, styled), the certificate's ±2 % on
 *   concentration as `error_x` in percent. That `error_x` sets no style, so it copies the y bars'
 *   color, thickness and cap width (`copy_ystyle` defaults to true).
 * - QC samples: an asymmetric acceptance window on the response (`error_y` percent with `value`
 *   and `valueminus`: +10 % / −15 %) drawn as thick capless bands, and an asymmetric spiking
 *   uncertainty on concentration (`error_x` constant, `symmetric: false`, `valueminus`), which
 *   keeps its own thin style with `copy_ystyle: false`.
 * - The two top standards saturate the detector and are left out of the fit: `selectedpoints`
 *   marks the standards used, `selected` / `unselected` style both groups (marker color, size,
 *   opacity and label color) on first paint.
 * - The fit line carries its coefficients in `meta`, read back by its `hovertemplate`.
 */
export const meta: ExampleMeta = {
  title: 'Uncertainty: calibration curve',
  description:
    'Calibration standards with x and y error bars (copy_ystyle), QC samples with asymmetric windows (valueminus), excluded standards dimmed via selectedpoints.',
  tags: ['uncertainty', 'scatter', 'error-bars', 'selection', 'science'],
  testTolerance: 0.004,
  size: { width: 720, height: 440 },
};

/** Standard concentrations (µg/L). */
const CONC = [0, 2, 5, 10, 20, 40, 60, 80, 100];
const SLOPE = 0.0125;
const INTERCEPT = 0.004;
/** Standards inside the detector's linear range (the top two saturate). */
const USED = [0, 1, 2, 3, 4, 5, 6];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(2031));
  // Peak area with a soft saturation above ~65 µg/L.
  const response = (c: number): number => {
    const linear = SLOPE * c + INTERCEPT;
    return c > 65 ? linear - 0.000045 * (c - 65) ** 2 : linear;
  };
  const area = CONC.map((c) => response(c) * (1 + normal() * 0.012));
  const sd = area.map((a) => 0.006 + a * 0.025);

  // Least-squares fit on the standards used.
  const xs = USED.map((i) => CONC[i]!);
  const ys = USED.map((i) => area[i]!);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const sxy = xs.reduce((s, v, i) => s + (v - mx) * (ys[i]! - my), 0);
  const sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  const qcConc = [15, 35, 55];
  const qcArea = qcConc.map((c) => response(c) * (1 + normal() * 0.03));

  const chart = createChart(el, {
    data: [
      {
        name: 'Fit (S1–S7)',
        mode: 'lines',
        x: [0, 70],
        y: [intercept, intercept + slope * 70],
        line: { color: '#80838f', width: 1.5, dash: 'dash' },
        meta: { slope, intercept },
        hovertemplate: 'area = %{meta.slope:.5f} · c + %{meta.intercept:.4f}<extra></extra>',
      },
      {
        name: 'Standards',
        mode: 'markers+text',
        x: CONC,
        y: area,
        text: CONC.map((_, i) => `S${i + 1}`),
        textposition: 'top left',
        hovertext: CONC.map((c, i) =>
          USED.includes(i) ? `S${i + 1}: ${c} µg/L, in fit` : `S${i + 1}: ${c} µg/L, saturated`,
        ),
        marker: { color: '#5e74d5', size: 8 },
        error_y: { type: 'data', array: sd, color: '#5e74d5', thickness: 1.5, width: 3 },
        error_x: { type: 'percent', value: 2 },
        selectedpoints: USED,
        selected: { marker: { color: '#5e74d5', size: 9 }, textfont: { color: '#c9cde0' } },
        unselected: {
          marker: { color: '#80838f', size: 7, opacity: 0.6 },
          textfont: { color: '#80838f' },
        },
      },
      {
        name: 'QC samples',
        mode: 'markers',
        x: qcConc,
        y: qcArea,
        marker: { color: '#cc540a', size: 9, symbol: 'diamond' },
        error_y: {
          type: 'percent',
          value: 10,
          valueminus: 15,
          thickness: 6,
          width: 0,
          color: 'rgba(204, 84, 10, 0.5)',
        },
        error_x: {
          type: 'constant',
          symmetric: false,
          value: 1.5,
          valueminus: 0.5,
          copy_ystyle: false,
        },
      },
    ],
    layout: {
      title: { text: 'Lead (Pb) calibration, ICP-MS run 24-117' },
      xaxis: { title: { text: 'Concentration (µg/L)' }, zeroline: false },
      yaxis: { title: { text: 'Peak area (AU)' }, zeroline: false },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
