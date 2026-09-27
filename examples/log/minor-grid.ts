import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Log axis with a minor grid (plan E11.11): the activity of three isotopes decaying over 60 days,
 * across five orders of magnitude. `dtick: 1` puts major ticks and grid lines on whole decades;
 * `minor: { showgrid: true }` adds lighter grid lines at 2–9 within each decade, so values between
 * decades can be read off. Exponential decay is a straight line on the log axis.
 */
export const meta: ExampleMeta = {
  title: 'Log: minor grid on a log axis',
  description:
    'Radioactive decay of three isotopes over five decades on a log y axis with decade ticks and a minor grid.',
  tags: ['log', 'axes', 'line', 'scatter', 'minor-ticks'],
  testTolerance: 0.004,
};

const ISOTOPES = [
  { name: 'Iodine 131 (8.0 d)', halfLife: 8.02 },
  { name: 'Phosphorus 32 (14.3 d)', halfLife: 14.27 },
  { name: 'Chromium 51 (27.7 d)', halfLife: 27.7 },
];

export function run(el: HTMLElement): ExampleHandle {
  const days = Array.from({ length: 121 }, (_, i) => i / 2);
  const chart = createChart(el, {
    data: ISOTOPES.map((iso) => ({
      type: 'scatter',
      mode: 'lines',
      name: iso.name,
      x: days,
      y: days.map((t) => 1e5 * 0.5 ** (t / iso.halfLife)),
      hovertemplate: 'Day %{x}: %{y:.3s} Bq<extra>%{fullData.name}</extra>',
    })),
    layout: {
      title: { text: 'Activity after 60 days' },
      legend: { x: 0.98, xanchor: 'right', y: 0.98 },
      xaxis: { title: { text: 'Days' } },
      yaxis: {
        type: 'log',
        title: { text: 'Activity (Bq)' },
        dtick: 1,
        exponentformat: 'power',
        minor: { showgrid: true, ticks: 'outside' },
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
