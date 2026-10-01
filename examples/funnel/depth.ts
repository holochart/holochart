import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 3D funnel (plan E8.9): `depth` extrudes the stages toward the viewer (here 70 % of the stage
 * thickness) with rounded front edges (`bevel`), and `layout.view3d` tilts and turns the plot
 * area. The connector regions and their outlines lie on the plane of the stages' front faces, so
 * the stages read as one continuous funnel; the labels sit on the front faces too.
 */
export const meta: ExampleMeta = {
  title: 'Funnel: 3D funnel (depth, 2.5D view)',
  description:
    'Sales funnel stages extruded toward the viewer with rounded edges, connectors on the front faces, in a tilted view.',
  tags: [
    'funnel',
    'financial',
    'chart',
    'depth',
    '2.5d',
    'view3d',
    '3d-native',
    'holochart-extension',
  ],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnel',
          name: 'Pipeline',
          y: ['Visits', 'Sign-ups', 'Trials', 'Quotes', 'Orders'],
          x: [1200, 780, 410, 190, 96],
          textinfo: 'value+percent initial',
          depth: '70%',
          bevel: { size: 3 },
          marker: { color: ['#1f5fa8', '#2f78c4', '#4b93d9', '#72afe6', '#9ccaf2'] },
          connector: { fillcolor: '#c9dcef', line: { color: '#7fa6cc', width: 1 } },
        },
      ],
      layout: {
        title: { text: 'Conversion funnel' },
        margin: { l: 80, r: 30 },
        showlegend: false,
        view3d: { enabled: true, tilt: 18, rotation: 22 },
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
