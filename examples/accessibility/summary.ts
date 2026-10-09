import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Generated chart summary: the accessible description of a chart starts with an overview of
 * trends and extremes, written from the data once the summary code has loaded. Here the overview
 * is also shown as a paragraph under the chart, so the page shows what a screen reader reads.
 * `chart.describe()` resolves to the description with the overview.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: generated summary',
  description:
    'Monthly revenue and costs as lines, with the generated summary ("Revenue rises from … It peaks at …") shown under the chart.',
  tags: ['a11y', 'summary', 'screen reader', 'line'],
  size: { width: 640, height: 460 },
  // The summary paragraph is DOM text, rasterized by the OS, whose fonts differ between machines.
  testTolerance: 0.006,
};

const MONTHS = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}-01`);

export function run(el: HTMLElement): ExampleHandle {
  const box = document.createElement('div');
  box.style.height = '360px';
  const text = document.createElement('p');
  text.style.cssText = 'margin:0;padding:8px 12px;font:13px/1.5 sans-serif;min-height:84px;';
  el.append(box, text);
  const chart = createChart(box, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Revenue',
        x: MONTHS,
        y: [1.2, 1.5, 1.4, 1.9, 2.2, 2.4, 2.3, 2.8, 3.1, 3.3, 3.6, 3.4].map((v) => v * 1e6),
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Costs',
        x: MONTHS,
        y: [2.0, 2.02, 1.98, 2.01, 2.03, 1.99, 2.0, 2.02, 2.01, 1.97, 2.0, 2.02].map(
          (v) => v * 1e6,
        ),
      },
    ],
    layout: {
      title: { text: 'Revenue and costs, 2024' },
      xaxis: { title: { text: 'Month' } },
      yaxis: { title: { text: 'USD' }, tickformat: '.2s' },
    },
  });
  const ready = chart.ready
    .then(() => chart.describe())
    .then((description) => {
      const full = chart.fullLayout;
      text.style.background = String(full?.paper_bgcolor ?? '');
      text.style.color = String(full?.font.color ?? '');
      text.textContent = description?.overview ?? '';
    });
  return {
    ready,
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      box.remove();
      text.remove();
    },
  };
}
