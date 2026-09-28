import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Patterns as redundant encoding (plan E17.5): with `config.a11y.patterns: true` every bar trace
 * gets its own hatch (overlaid on its color) and every pie slice its own, so series and slices
 * stay apart without color — for color-vision deficiencies and grayscale print. Traces that set
 * their own `marker.pattern` keep it.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: pattern encoding',
  description:
    'Grouped bars and a pie with config.a11y.patterns: true — a distinct hatch per bar trace and per slice, in addition to color.',
  tags: ['a11y', 'patterns', 'bar', 'pie', 'config'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

const REGIONS = ['North', 'South', 'East', 'West'];

export function run(el: HTMLElement): ExampleHandle {
  const bar = (name: string, y: number[]) => ({
    type: 'bar',
    name,
    x: REGIONS,
    y,
    xaxis: 'x',
    yaxis: 'y',
  });
  const chart = createChart(el, {
    data: [
      bar('2022', [12, 9, 14, 7]),
      bar('2023', [14, 11, 13, 9]),
      bar('2024', [17, 12, 16, 11]),
      {
        type: 'pie',
        name: 'Channels',
        labels: ['Online', 'Retail', 'Partners', 'Direct'],
        values: [46, 28, 16, 10],
        domain: { x: [0.62, 1], y: [0, 0.9] },
        hole: 0.35,
        showlegend: false,
        textinfo: 'label',
      },
    ],
    layout: {
      title: { text: 'Sales by region and channel' },
      xaxis: { domain: [0, 0.55] },
      yaxis: { title: { text: 'Units (k)' } },
    },
    config: { a11y: { patterns: true } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
