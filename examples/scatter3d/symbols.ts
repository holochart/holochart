import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Every 3D marker symbol (plan E14.2, Plotly's `gl3d` set): `circle`, `circle-open`, `cross`,
 * `diamond`, `diamond-open`, `square`, `square-open` and `x`, one trace per symbol so the legend
 * shows each glyph. Click a legend item to hide its trace.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: marker symbols',
  description: "Plotly's eight 3D marker symbols, one trace each, with a legend.",
  tags: ['scatter3d', '3d', 'markers', 'symbols', 'legend'],
  testTolerance: 0.004,
};

const SYMBOLS = [
  'circle',
  'circle-open',
  'cross',
  'diamond',
  'diamond-open',
  'square',
  'square-open',
  'x',
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: SYMBOLS.map((symbol, k) => {
      const a = (k / SYMBOLS.length) * 2 * Math.PI;
      const pts = [0, 1, 2, 3].map((j) => j / 3);
      return {
        type: 'scatter3d',
        mode: 'markers',
        name: symbol,
        x: pts.map((r) => Math.cos(a) * (1 + r)),
        y: pts.map((r) => Math.sin(a) * (1 + r)),
        z: pts.map((r) => r * 2 + k * 0.1),
        marker: { symbol, size: 10, line: { width: 1.5 } },
      };
    }),
    layout: {
      title: { text: 'Marker symbols' },
      scene: { camera: { eye: { x: 0.2, y: -1.2, z: 1.6 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
