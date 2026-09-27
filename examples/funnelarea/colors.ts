import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Funnel area colors (plan E12.6): stages without `marker.colors` take `layout.funnelareacolorway`
 * by label — here a cool-to-warm ramp, extended with lighter then darker copies
 * (`extendfunnelareacolors`) once the labels outnumber it — and thicker outlines in the paper
 * color separate them.
 */
export const meta: ExampleMeta = {
  title: 'Funnel area: stage colors',
  description:
    'Stage colors from layout.funnelareacolorway, extended with lighter copies for extra stages, with thick outlines.',
  tags: ['funnelarea', 'financial', 'chart', 'colorway', 'style', 'legend'],
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
          type: 'funnelarea',
          labels: ['Seen', 'Clicked', 'Browsed', 'Carted', 'Checked out', 'Paid'],
          values: [60, 25, 12, 8, 5, 3],
          textinfo: 'label+percent',
          marker: { line: { width: 3 } },
        },
      ],
      layout: {
        funnelareacolorway: ['#5e74d5', '#9962c0', '#b8267e', '#ea2a37'],
        showlegend: true,
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
