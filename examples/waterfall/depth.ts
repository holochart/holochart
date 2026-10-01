import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 3D waterfall (plan E8.9): `depth` extrudes the steps toward the viewer (60 % of the bar
 * width) with rounded edges, lit by Plotly's lighting model, in a tilted and turned view
 * (`layout.view3d`). The connector lines run along the front faces of the bar ends, and the change
 * labels stay on the front faces.
 */
export const meta: ExampleMeta = {
  title: 'Waterfall: 3D steps (depth, 2.5D view)',
  description:
    'Profit and loss steps extruded toward the viewer, connectors along the front faces, in a tilted view.',
  tags: [
    'waterfall',
    'financial',
    'chart',
    'depth',
    '2.5d',
    'view3d',
    '3d-native',
    'holochart-extension',
  ],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,+-−$k ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'waterfall',
          name: 'FY 2025',
          x: ['Sales', 'Services', 'Revenue', 'Purchases', 'Salaries', 'Taxes', 'Profit'],
          measure: ['relative', 'relative', 'total', 'relative', 'relative', 'relative', 'total'],
          y: [420, 160, null, -180, -150, -52, null],
          textinfo: 'delta',
          textposition: 'inside',
          depth: '60%',
          bevel: { size: 3 },
          connector: { line: { color: '#c8ccd8', width: 1.5 } },
        },
      ],
      layout: {
        title: { text: 'Profit and loss, $k' },
        showlegend: false,
        view3d: { enabled: true, tilt: 20, rotation: -24 },
      },
    });
    await componentsReady(chart);
  });

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
