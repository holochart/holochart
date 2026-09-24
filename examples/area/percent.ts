import { createChart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 100% stacked area (plan E9.4): `groupnorm: 'percent'` on the stack group scales every position's
 * total to 100, so the chart shows shares rather than amounts. The first trace of the group that
 * sets `groupnorm` decides for the whole group. The y axis gets a `'%'` tick suffix.
 */
export const meta: ExampleMeta = {
  title: 'Area: 100% stacked',
  description:
    "Shares of a total over time: a stack group normalized with groupnorm: 'percent' and a % tick suffix.",
  tags: ['area', 'stacked', 'percent', 'fill', 'scatter'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // Closed-form traffic by device, in millions of visits per month (raw amounts, not shares).
  const months = Array.from({ length: 36 }, (_, i) =>
    new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10),
  );
  const series = [
    { name: 'Desktop', f: (i: number) => 60 - i * 0.9 + 4 * Math.sin(i / 2) },
    { name: 'Mobile', f: (i: number) => 35 + i * 1.3 + 3 * Math.cos(i / 3) },
    { name: 'Tablet', f: (i: number) => 12 - i * 0.12 + Math.sin(i) },
    { name: 'Other', f: (i: number) => 3 + i * 0.05 },
  ];

  useExampleFonts();
  const chart = createChart(el, {
    data: series.map((s, k) => ({
      type: 'scatter',
      name: s.name,
      x: months,
      y: months.map((_, i) => s.f(i)),
      stackgroup: 'share',
      ...(k === 0 ? { groupnorm: 'percent' } : {}),
      hovertemplate: '%{y:.1f}%',
    })),
    layout: {
      font: { family: 'Inter', size: 12 },
      hovermode: 'x unified',
      title: { text: 'Visits by device' },
      yaxis: { ticksuffix: '%', range: [0, 100] },
      margin: { l: 56, r: 24, t: 48, b: 40 },
      plot_bgcolor: '#e5ecf6',
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
