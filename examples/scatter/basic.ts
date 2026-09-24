import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scatter basics (plan E9.1, E9.2): Plotly's default modes — a 12-point series gets
 * `lines+markers`, a 120-point series `lines` — next to a `markers` cloud with an outline, a
 * per-point symbol array, and a trace raised above the others with `zorder`.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: markers and lines',
  description:
    'Default modes (lines+markers under 20 points, lines above), a marker cloud, per-point symbols and zorder.',
  tags: ['scatter', 'markers', 'lines'],
  // SDF text anti-aliasing (axis labels, legend) varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(21);
  const normal = gaussian(rng(22));

  const n = 120;
  const wave = {
    x: Float64Array.from({ length: n }, (_, i) => i / 12),
    y: Float64Array.from({ length: n }, (_, i) => 6 + 2 * Math.sin(i / 9) + normal() * 0.25),
  };
  const steps = {
    x: Float64Array.from({ length: 12 }, (_, i) => i * 0.9),
    y: Float64Array.from({ length: 12 }, (_, i) => 2 + i * 0.35 + random()),
  };
  const cloudN = 80;
  const cloud = {
    x: Float64Array.from({ length: cloudN }, () => 5 + normal() * 2),
    y: Float64Array.from({ length: cloudN }, () => 4 + normal() * 1.2),
  };
  const symbols = ['circle', 'square', 'diamond', 'triangle-up', 'x'];

  const chart = createChart(el, {
    data: [
      { x: wave.x, y: wave.y, name: 'lines (120 pts)' },
      { x: steps.x, y: steps.y, name: 'lines+markers (12 pts)', zorder: 1 },
      {
        ...cloud,
        mode: 'markers',
        name: 'markers',
        marker: {
          size: 9,
          symbol: Array.from({ length: cloudN }, (_, i) => symbols[i % symbols.length]!),
          opacity: 0.75,
          line: { width: 1, color: '#0a0a0f' },
        },
      },
    ],
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
