import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Materials of extruded bars (plan E9.10, E8.7): four grouped traces with the same data and a
 * different `material` each — Plotly's lighting model (the default), unlit (`flat`), a metallic
 * three.js `standard` material and a banded `toon` material — in the 2.5D view.
 */
export const meta: ExampleMeta = {
  title: 'Bar: 3D bar materials',
  description: 'Grouped 3D bars shaded with Plotly lighting, unlit, metallic standard and toon.',
  tags: [
    'bar',
    'chart',
    'depth',
    'materials',
    'lighting',
    '2.5d',
    'view3d',
    '3d-native',
    'holochart-extension',
  ],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = ['2022', '2023', '2024'];
  const bars = (name: string, material: Record<string, unknown>, y: number[]) => ({
    type: 'bar' as const,
    name,
    x,
    y,
    depth: '80%',
    bevel: { size: 2 },
    material,
  });
  const chart = createChart(el, {
    data: [
      bars('plotly', { type: 'plotly' }, [6, 8, 7]),
      bars('flat', { type: 'flat' }, [5, 7, 9]),
      bars('standard', { type: 'standard', metalness: 0.6, roughness: 0.35 }, [7, 6, 8]),
      bars('toon', { type: 'toon', steps: 3 }, [4, 9, 6]),
    ],
    layout: {
      title: { text: 'One trace per material' },
      barmode: 'group',
      xaxis: { type: 'category' },
      view3d: { enabled: true, tilt: 22, rotation: -18 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
