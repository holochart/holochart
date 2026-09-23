import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Many series (plan E9.2, E5.2): ten lines take their colors from the default colorway and get a
 * legend entry each (click one to hide it, double-click to isolate it). `hovermode: 'x unified'`
 * shows every series at the hovered date in one label.
 */
export const meta: ExampleMeta = {
  title: 'Line: many series with a legend',
  description:
    "Ten series colored by the colorway, a titled legend, and 'x unified' hover across all of them.",
  tags: ['line', 'scatter', 'legend', 'date', 'hover'],
  testTolerance: 0.004,
};

const REGIONS = [
  'North',
  'North-east',
  'East',
  'South-east',
  'South',
  'South-west',
  'West',
  'North-west',
  'Central',
  'Islands',
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(57));
  const weeks = Array.from({ length: 52 }, (_, i) =>
    new Date(Date.UTC(2025, 0, 6) + i * 7 * 86_400_000).toISOString().slice(0, 10),
  );

  const data = REGIONS.map((name, k) => {
    let v = 20 + k * 6;
    const drift = (k % 3) - 1;
    return {
      type: 'scatter',
      mode: 'lines',
      name,
      x: weeks,
      y: weeks.map(() => (v = Math.max(1, v + drift * 0.4 + normal() * 1.6))),
      line: { width: 1.5 },
    };
  });

  useExampleFonts();
  const chart = createChart(el, {
    data,
    layout: {
      font: { family: 'Inter', size: 12 },
      hovermode: 'x unified',
      legend: { title: { text: 'Region' } },
      yaxis: { title: { text: 'Orders per week' } },
      margin: { l: 56, r: 24, t: 24, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
