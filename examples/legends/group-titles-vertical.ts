import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Legend group titles in a vertical legend (plan E5.2): quarterly revenue of six product lines in
 * three divisions. Traces of a division share a `legendgroup`, and the first one names it
 * (`legendgrouptitle.text`); each group starts with its title row, text-only and set in
 * `legend.grouptitlefont`, and `tracegroupgap` separates the groups.
 *
 * The legend is a column at the right of the plot (`orientation: 'v'`; the default look's is a
 * row above it). A group title can be styled per trace (`legendgrouptitle.font`, bold here). Click
 * a title to hide or show its division; with `groupclick: 'toggleitem'` titles would be inert.
 */
export const meta: ExampleMeta = {
  title: 'Legend: group titles in a vertical legend',
  description:
    'Grouped bars of six product lines in three divisions: a vertical legend with a title row per legendgroup, a styled grouptitlefont and tracegroupgap.',
  tags: ['legend', 'bar'],
  size: { width: 720, height: 420 },
};

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

const LINES = [
  { division: 'Consumer', name: 'Phones', values: [42, 38, 45, 61], color: '#5e74d5' },
  { division: 'Consumer', name: 'Wearables', values: [12, 14, 15, 22], color: '#8fa3f0' },
  { division: 'Enterprise', name: 'Servers', values: [30, 33, 35, 34], color: '#ea2a37' },
  { division: 'Enterprise', name: 'Storage', values: [18, 19, 22, 24], color: '#f07a82' },
  { division: 'Services', name: 'Cloud', values: [25, 29, 34, 39], color: '#118e36' },
  { division: 'Services', name: 'Support', values: [9, 9, 10, 11], color: '#5cc27a' },
];

export function run(el: HTMLElement): ExampleHandle {
  const titled = new Set<string>();
  const data = LINES.map((l) => {
    const first = !titled.has(l.division);
    titled.add(l.division);
    return {
      type: 'bar' as const,
      name: l.name,
      x: QUARTERS,
      y: l.values,
      marker: { color: l.color },
      legendgroup: l.division,
      ...(first
        ? {
            legendgrouptitle: {
              text: l.division,
              ...(l.division === 'Services' ? { font: { weight: 'bold' as const } } : {}),
            },
          }
        : {}),
    };
  });

  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Revenue by product line, 2025 ($M)' },
      yaxis: { title: { text: '$M' } },
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        tracegroupgap: 10,
        grouptitlefont: { size: 10, color: '#eceef4' },
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
