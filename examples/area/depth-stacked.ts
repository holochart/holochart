import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked areas as layered slabs (plan E8.9): four traces in one `stackgroup` (so `fill:
 * 'tonexty'`) with the same `depth` form one 30 px slab in colored layers, each layer lit on its
 * front and on its top wall, in a tilted view (`layout.view3d`). The boundary lines are drawn on
 * the front face.
 */
export const meta: ExampleMeta = {
  title: 'Area: stacked slabs (depth, 2.5D view)',
  description:
    'Four stacked areas extruded into one layered 30 px slab, boundary lines on the front face.',
  tags: [
    'area',
    'stacked',
    'fill',
    'scatter',
    'depth',
    '2.5d',
    'view3d',
    '3d-native',
    'holochart-extension',
  ],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const years = Array.from({ length: 13 }, (_, i) => 2012 + i);
  const t = (y: number): number => (y - 2012) / 12;
  const sources = [
    { name: 'Coal', y: years.map((y) => 420 - 260 * t(y) ** 1.6) },
    { name: 'Gas', y: years.map((y) => 160 + 140 * Math.sin(Math.PI * t(y) * 0.9)) },
    { name: 'Nuclear', y: years.map((y) => 180 - 40 * t(y)) },
    { name: 'Renewables', y: years.map((y) => 40 + 360 * t(y) ** 1.8) },
  ];
  const chart = createChart(el, {
    data: sources.map((s) => ({
      type: 'scatter',
      name: s.name,
      x: years,
      y: s.y.map(Math.round),
      stackgroup: 'one',
      depth: 30,
    })),
    layout: {
      title: { text: 'Electricity generation by source, TWh' },
      view3d: { enabled: true, tilt: 25, rotation: -20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
