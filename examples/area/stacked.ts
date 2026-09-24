import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked area (plan E9.4): four traces with the same `stackgroup` add up their y values. Stacking
 * turns on `fill: 'tonexty'` and defaults `mode` to `'lines'`, so each band fills down to the trace
 * below it. Each fill is drawn above the previous trace's fill but below its line, so every
 * boundary stays visible. With `hovermode: 'x unified'`, the label lists each source's own value,
 * not the running total.
 */
export const meta: ExampleMeta = {
  title: 'Area: stacked',
  description:
    "Four sources stacked with stackgroup, which implies fill: 'tonexty'; unified hover shows each trace's own value.",
  tags: ['area', 'stacked', 'fill', 'scatter', 'hover'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Closed-form curves: electricity generation by source, in TWh per year.
  const years = Array.from({ length: 25 }, (_, i) => 2000 + i);
  const t = (y: number): number => (y - 2000) / 24;
  const sources = [
    { name: 'Coal', y: years.map((y) => 420 - 260 * t(y) ** 1.6 + 18 * Math.sin(y)) },
    { name: 'Gas', y: years.map((y) => 160 + 140 * Math.sin(Math.PI * t(y) * 0.9)) },
    { name: 'Nuclear', y: years.map((y) => 180 - 40 * t(y) + 8 * Math.cos(y / 2)) },
    { name: 'Renewables', y: years.map((y) => 40 + 360 * t(y) ** 1.8) },
  ];

  const chart = createChart(el, {
    data: sources.map((s) => ({
      type: 'scatter',
      name: s.name,
      x: years,
      y: s.y.map(Math.round),
      stackgroup: 'one',
    })),
    layout: {
      hovermode: 'x unified',
      title: { text: 'Electricity generation by source' },
      yaxis: { title: { text: 'TWh' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
