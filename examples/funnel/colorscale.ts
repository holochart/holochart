import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel colors from a colorscale (plan E12.5): `marker.color` takes numbers mapped through
 * `marker.colorscale` (bar's marker), with a colorbar from `marker.showscale`. With per-stage
 * colors the connector regions would default to translucent black, so `connector.fillcolor`
 * tints them to match the dark background.
 */
export const meta: ExampleMeta = {
  title: 'Funnel: colorscale and connector fill',
  description:
    'Stage colors mapped through a colorscale with a colorbar, value and percent-of-previous labels, and a custom connector fill.',
  tags: ['funnel', 'financial', 'chart', 'colorscale', 'colorbar', 'style'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const VALUES = [9000, 2600, 800, 190];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'funnel',
          name: 'Signups',
          y: ['Seen', 'Clicked', 'Signed up', 'Paid'],
          x: VALUES,
          textinfo: 'value+percent previous',
          marker: { color: VALUES, colorscale: 'Viridis', showscale: true },
          connector: { fillcolor: 'rgba(128, 131, 143, 0.25)' },
        },
      ],
      layout: {
        title: { text: 'Signup funnel' },
        margin: { l: 70 },
        showlegend: false,
      },
      config: { responsive: true },
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
