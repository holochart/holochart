import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Dashes and widths (plan E9.2): an actual series (solid, wide), its forecast (`dash`), a target
 * (`dot`), and limits (`longdash`, `dashdot`, and a custom dash list in px). Dash style tells
 * series apart without relying on color alone.
 */
export const meta: ExampleMeta = {
  title: 'Line: dashes and widths',
  description:
    "Solid, 'dash', 'dot', 'longdash', 'dashdot' and a custom '8px,3px,2px,3px' dash list at different widths.",
  tags: ['line', 'scatter', 'dash'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(29));
  const months = Array.from({ length: 24 }, (_, i) => i + 1);
  const actual = months.slice(0, 15).map((m) => 40 + m * 1.6 + normal() * 2.5);
  const last = actual[actual.length - 1]!;
  const forecastX = months.slice(14);
  const forecast = forecastX.map((_, k) => last + k * 1.4);

  useExampleFonts();
  const chart = createChart(el, {
    data: [
      {
        name: 'upper limit (longdash)',
        x: months,
        y: months.map((m) => 62 + m * 1.5),
        line: { dash: 'longdash', width: 1, color: '#7f7f7f' },
      },
      {
        name: 'lower limit (dashdot)',
        x: months,
        y: months.map((m) => 30 + m * 1.5),
        line: { dash: 'dashdot', width: 1, color: '#7f7f7f' },
      },
      {
        name: 'target (dot)',
        x: months,
        y: months.map(() => 70),
        line: { dash: 'dot', width: 2, color: '#00cc96' },
      },
      {
        name: 'budget (custom dash list)',
        x: months,
        y: months.map((m) => 36 + m * 1.9),
        line: { dash: '8px,3px,2px,3px', width: 2, color: '#ab63fa' },
      },
      { name: 'actual', x: months.slice(0, 15), y: actual, line: { width: 3.5, color: '#636efa' } },
      {
        name: 'forecast (dash)',
        x: forecastX,
        y: forecast,
        line: { dash: 'dash', width: 3.5, color: '#636efa' },
      },
    ].map((t) => ({ type: 'scatter', mode: 'lines', ...t })),
    layout: {
      font: { family: 'Inter', size: 12 },
      xaxis: { title: { text: 'Month' } },
      margin: { l: 48, r: 24, t: 24, b: 48 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
