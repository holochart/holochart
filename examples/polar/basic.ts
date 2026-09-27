import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Polar scatter basics (plan E11.4): `scatterpolar` markers and lines on the default polar
 * subplot (`layout.polar`). Angles are degrees counterclockwise from 3 o'clock; the radial axis
 * autoranges from zero (`rangemode: 'tozero'`) and is drawn along the first sector angle.
 */
export const meta: ExampleMeta = {
  title: 'Polar: markers and lines',
  description: 'A marker cloud and a lines+markers spiral on a polar subplot.',
  tags: ['polar', 'scatterpolar', 'markers', 'lines'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const n = 60;
  const cloud = {
    r: Float64Array.from({ length: n }, () => 3 + normal() * 0.8),
    theta: Float64Array.from({ length: n }, (_, i) => (i * 360) / n + normal() * 6),
  };
  const spiral = {
    r: Float64Array.from({ length: 16 }, (_, i) => 0.5 + i * 0.3),
    theta: Float64Array.from({ length: 16 }, (_, i) => i * 40),
  };
  const chart = createChart(el, {
    data: [
      { type: 'scatterpolar', ...cloud, mode: 'markers', name: 'cloud', marker: { size: 6 } },
      { type: 'scatterpolar', ...spiral, name: 'spiral' },
    ],
    layout: { title: { text: 'Polar scatter' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
