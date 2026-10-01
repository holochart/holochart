import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Grouped extruded bars (plan E9.10): two traces side by side (`barmode: 'group'`), extruded by a
 * share of their width (`depth: '100%'`: as deep as they are wide) with rounded edges, in the 2.5D
 * view seen from above only (`rotation: 0`).
 */
export const meta: ExampleMeta = {
  title: 'Bar: grouped 3D bars',
  description: 'Two grouped bar traces as square-section 3D columns with rounded edges.',
  tags: [
    'bar',
    'chart',
    'grouped',
    'depth',
    'bevel',
    '2.5d',
    'view3d',
    '3d-native',
    'holochart-extension',
  ],
};

const CITIES = ['Oslo', 'Lima', 'Pune', 'Kobe', 'Graz'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: '2024',
        x: CITIES,
        y: [31, 44, 58, 39, 27],
        depth: '100%',
        bevel: { size: 3, segments: 4 },
      },
      {
        type: 'bar',
        name: '2025',
        x: CITIES,
        y: [35, 41, 66, 45, 30],
        depth: '100%',
        bevel: { size: 3, segments: 4 },
      },
    ],
    layout: {
      title: { text: 'Visitors (thousands)' },
      barmode: 'group',
      view3d: { enabled: true, tilt: 30, rotation: 0, perspective: 0.35 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
