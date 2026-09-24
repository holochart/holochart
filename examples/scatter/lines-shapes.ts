import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Line shapes and gaps (plan E9.2): the same eight points drawn with every `line.shape` (linear,
 * spline at smoothing 1 and 1.3, and the four step shapes), each series offset upward. The two
 * top series have a missing point: broken by default, bridged with `connectgaps`; they also show
 * `line.dash` styles.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: line shapes, dashes and gaps',
  description:
    'linear, spline, hv, vh, hvh and vhv shapes on the same data; dashes; null gaps with and without connectgaps.',
  tags: ['scatter', 'lines'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

const X = [0, 1, 2, 3, 4, 5, 6, 7];
const Y = [0, 0.8, 0.3, 1.2, 0.6, 0.9, 0.1, 0.7];

export function run(el: HTMLElement): ExampleHandle {
  const series = [
    { name: 'linear', line: { shape: 'linear' } },
    { name: 'spline', line: { shape: 'spline' } },
    { name: 'spline 1.3', line: { shape: 'spline', smoothing: 1.3 } },
    { name: 'hv', line: { shape: 'hv' } },
    { name: 'vh', line: { shape: 'vh' } },
    { name: 'hvh', line: { shape: 'hvh' } },
    { name: 'vhv', line: { shape: 'vhv' } },
  ].map((s, k) => ({
    ...s,
    x: X,
    y: Y.map((v) => v + k * 1.6),
    mode: 'lines+markers',
    marker: { size: 5 },
  }));
  const gappy = Y.map((v, i) => (i === 3 ? null : v + 7 * 1.6));
  const top = [
    {
      name: 'gap (dash)',
      x: X,
      y: gappy,
      mode: 'lines+markers',
      line: { dash: 'dash', width: 2 },
      marker: { size: 5 },
    },
    {
      name: 'connectgaps (dot)',
      x: X,
      y: gappy.map((v) => (v === null ? null : v + 1.6)),
      mode: 'lines+markers',
      connectgaps: true,
      line: { dash: 'dot', width: 3 },
      marker: { size: 5 },
    },
  ];

  const chart = createChart(el, {
    data: [...series, ...top],
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
