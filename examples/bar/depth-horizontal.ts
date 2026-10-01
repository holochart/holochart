import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Horizontal extruded bars (plan E9.10): `orientation: 'h'` with negative values and a `base`
 * (bars from 10), extruded by half their height (the percentage follows the bar's width along
 * the position axis), in the 2.5D view turned to the right. Text labels sit on the bars' front
 * faces.
 */
export const meta: ExampleMeta = {
  title: 'Bar: horizontal 3D bars with a base',
  description: 'Horizontal bars from a base, negative values included, extruded with labels.',
  tags: [
    'bar',
    'chart',
    'horizontal',
    'depth',
    'text',
    '2.5d',
    'view3d',
    '3d-native',
    'holochart-extension',
  ],
};

export function run(el: HTMLElement): ExampleHandle {
  const values = [24, 17, 9, -4, -12];
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        orientation: 'h',
        y: ['North', 'East', 'South', 'West', 'Central'],
        x: values,
        base: 10,
        depth: '50%',
        bevel: { size: 3 },
        text: values.map((v) => (v > 0 ? `+${v}` : `${v}`)),
        textposition: 'inside',
        marker: { color: values.map((v) => (v > 0 ? '#10b981' : '#ef4444')) },
      },
    ],
    layout: {
      title: { text: 'Change from the target of 10' },
      showlegend: false,
      view3d: { enabled: true, tilt: 12, rotation: 30 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
