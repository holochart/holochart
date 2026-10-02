import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A print-friendly, grayscale chart (plan E8.10): on the `simple_white` template, stacked bars are
 * told apart by pattern alone. Every trace is black on white (`marker.color` for the hatch and the
 * outline, `bgcolor` white), so the chart survives black-and-white printing, photocopies and
 * color-blind readers; the legend glyphs carry the same patterns.
 */
export const meta: ExampleMeta = {
  title: 'Bar: print-friendly patterns',
  description:
    'Stacked bars in black and white on simple_white, told apart by hatch pattern alone.',
  tags: ['bar', 'chart', 'pattern', 'stacked', 'grayscale', 'accessibility'],
};

const QUIET_MS = 500;

/** Resolves once frames have stopped for a while (tick labels typeset asynchronously). */
function settled(chart: Chart): Promise<void> {
  return chart.ready.then(
    () =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          off();
          resolve();
        };
        let timer = setTimeout(done, QUIET_MS);
        const off = chart.on('afterrender', () => {
          clearTimeout(timer);
          timer = setTimeout(done, QUIET_MS);
        });
      }),
  );
}

export function run(el: HTMLElement): ExampleHandle {
  const x = ['North', 'South', 'East', 'West'];
  const series = [
    { name: 'Residential', y: [42, 35, 28, 39], shape: '' },
    { name: 'Commercial', y: [25, 31, 22, 18], shape: '/' },
    { name: 'Industrial', y: [18, 12, 30, 21], shape: 'x' },
    { name: 'Transport', y: [9, 14, 11, 16], shape: '.' },
  ] as const;
  const chart = createChart(el, {
    data: series.map((s, k) => ({
      type: 'bar' as const,
      name: s.name,
      x,
      y: s.y,
      marker: {
        // The first series is solid grey; the others hatch in black on white.
        color: k === 0 ? '#bbbbbb' : '#000000',
        line: { color: '#000000', width: 1 },
        // `simple_white` (like Plotly's templates) overlays patterns: replace the fill instead.
        pattern: {
          shape: s.shape,
          fillmode: 'replace',
          bgcolor: '#ffffff',
          size: 7,
          solidity: 0.3,
        },
      },
    })),
    layout: {
      template: 'simple_white',
      barmode: 'stack',
      title: { text: 'Energy use by region (print)' },
      yaxis: { title: { text: 'TWh' } },
    },
    config: { responsive: true },
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
