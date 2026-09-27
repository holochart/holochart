import { createChart, symbols } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Custom marker symbols (plan E8.11): SVG paths registered with `symbols.register` become
 * `marker.symbol` values with the built-in `-open` / `-dot` / `-open-dot` variants. The paths are
 * turned into signed distance fields, so outlines (`marker.line`), open variants and `marker.angle`
 * work as for Plotly's symbols. The pin is anchored at its tip, so the tip marks the data point.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: custom marker symbols',
  description:
    'SVG-path symbols registered with symbols.register: an anchored map pin, a sparkle and a bolt, with open/dot variants, outlines, per-point angles and mixed built-in symbols.',
  tags: ['scatter', 'markers', 'symbols'],
  testTolerance: 0.004,
};

/** Map pin (24 × 24 icon grid) with a round hole; `evenodd` keeps the hole open. */
const PIN =
  'M12 1.5C7.9 1.5 4.75 4.65 4.75 8.75C4.75 14 12 22.5 12 22.5S19.25 14 19.25 8.75C19.25 4.65 16.1 1.5 12 1.5ZM12 5.9A2.85 2.85 0 1 0 12 11.6A2.85 2.85 0 1 0 12 5.9Z';
/** Four-pointed sparkle with concave sides. */
const SPARKLE =
  'M12 0C12.8 7.2 16.8 11.2 24 12C16.8 12.8 12.8 16.8 12 24C11.2 16.8 7.2 12.8 0 12C7.2 11.2 11.2 7.2 12 0Z';
/** Lightning bolt. */
const BOLT = 'M14 1L4 14H11L9 23L20 9H13L15 1Z';

export function run(el: HTMLElement): ExampleHandle {
  // Register before plotting: figures are validated against the symbols known at that time.
  symbols.register('pin', { path: PIN, anchor: [12, 22.5], fillRule: 'evenodd' });
  symbols.register('sparkle', { path: SPARKLE });
  symbols.register('bolt', { path: BOLT });

  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        name: 'pin',
        mode: 'markers',
        x,
        y: [3.1, 3.6, 3.3, 4.2, 3.9, 4.6, 4.4, 5.1],
        marker: { symbol: 'pin', size: 26, color: '#ea2a37', line: { width: 1, color: '#0a0a0f' } },
      },
      {
        type: 'scatter',
        name: 'sparkle-open',
        mode: 'markers',
        x,
        y: [2.1, 2.4, 2.2, 2.7, 2.5, 3, 2.8, 3.2],
        marker: {
          symbol: 'sparkle-open',
          size: 22,
          color: '#5e74d5',
          line: { width: 1.5 },
          angle: x.map((v) => v * 11.25),
        },
      },
      {
        type: 'scatter',
        name: 'bolt, mixed',
        mode: 'lines+markers',
        x,
        y: [0.8, 1.3, 1, 1.6, 1.2, 1.9, 1.5, 2],
        line: { color: '#3e3e4c' },
        marker: {
          symbol: [
            'bolt',
            'bolt-dot',
            'bolt-open',
            'bolt-open-dot',
            'pin-open',
            'sparkle-dot',
            'diamond',
            'bolt',
          ],
          size: 20,
          color: '#9962c0',
          line: { width: 1, color: '#eceef4' },
        },
      },
    ],
    layout: { xaxis: { range: [0.3, 8.7] }, yaxis: { range: [0.2, 5.8] } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
