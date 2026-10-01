import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Stacked extruded bars (plan E9.10): three traces in `barmode: 'stack'`, each with `depth`, seen
 * in the 2.5D view (`layout.view3d`). Segments stack as in the flat view; each is its own lit
 * prism, so the joins between them show on the sides.
 */
export const meta: ExampleMeta = {
  title: 'Bar: stacked 3D bars',
  description: 'Three stacked bar traces extruded toward the viewer in the tilted 2.5D view.',
  tags: ['bar', 'chart', 'stacked', 'depth', '2.5d', 'view3d', '3d-native', 'holochart-extension'],
};

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export function run(el: HTMLElement): ExampleHandle {
  const trace = (name: string, y: number[]) => ({
    type: 'bar' as const,
    name,
    x: QUARTERS,
    y,
    depth: 24,
    bevel: { size: 2 },
  });
  const chart = createChart(el, {
    data: [
      trace('Hardware', [12, 15, 14, 18]),
      trace('Software', [8, 9, 12, 14]),
      trace('Services', [5, 7, 6, 9]),
    ],
    layout: {
      title: { text: 'Revenue by segment' },
      barmode: 'stack',
      view3d: { enabled: true, tilt: 25, rotation: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
