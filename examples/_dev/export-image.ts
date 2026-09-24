import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Raster export (plan E18.1): a chart with every kind of WebGL content — traces, axes, text, a
 * legend, an annotation, a shape and a layout image — and a button row that exports it with
 * `chart.toImage` (PNG, JPEG, WebP, 2× and transparent) and shows the results below. The modebar
 * camera button exports with `config.toImageButtonOptions` (here: 2×, `holochart-export.png`).
 *
 * The figure is drawn again offscreen at the requested size, so the images never contain the
 * modebar or hover labels. Not a visual test (the button row and gallery sit outside the chart):
 * tests/interaction/export.spec.ts compares `toImage` with a screenshot of this chart instead.
 */
export const meta: ExampleMeta = {
  title: 'Export: toImage',
  description:
    'Export a chart with traces, legend, annotation, shape and image to PNG, JPEG or WebP, at 2× or with a transparent background.',
  tags: ['dev', 'chart', 'export', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const LOGO = new URL('../_lib/assets/logo.png', import.meta.url).href;

export function run(el: HTMLElement): ExampleHandle {
  const chartEl = document.createElement('div');
  chartEl.style.cssText = 'width:640px;height:400px;';
  el.appendChild(chartEl);
  const chart = createChart(chartEl, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Signal',
        x: [0, 1, 2, 3, 4, 5],
        y: [2, 5, 3, 7, 4, 8],
      },
      { type: 'bar', name: 'Load', x: [0, 1, 2, 3, 4, 5], y: [1, 2, 2, 3, 2, 4] },
    ],
    layout: {
      title: { text: 'Export me' },
      xaxis: { title: { text: 'Step' } },
      yaxis: { title: { text: 'Value' } },
      annotations: [{ x: 3, y: 7, text: 'Peak', showarrow: true, ax: -30, ay: -24 }],
      shapes: [
        { type: 'rect', x0: 3.5, x1: 4.5, y0: 0, y1: 8.5, opacity: 0.25, line: { width: 0 } },
      ],
      images: [
        {
          source: LOGO,
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 1.02,
          sizex: 0.16,
          sizey: 0.16,
          xanchor: 'right',
          yanchor: 'bottom',
        },
      ],
    },
    config: { toImageButtonOptions: { filename: 'holochart-export', scale: 2 } },
  });

  // A small gallery of exports, below the chart.
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;margin:8px 0;font:12px sans-serif;';
  const out = document.createElement('div');
  out.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
  const variants = [
    ['PNG', {}],
    ['JPEG', { format: 'jpeg' }],
    ['WebP', { format: 'webp' }],
    ['2×', { scale: 2 }],
    ['Transparent', { transparent: true }],
    ['320×200', { width: 320, height: 200 }],
  ] as const;
  for (const [label, options] of variants) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => {
      void chart.toImage(options).then((url) => {
        const img = document.createElement('img');
        img.src = url;
        img.title = label;
        img.style.cssText =
          'width:320px;background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/16px 16px;';
        out.prepend(img);
      });
    };
    bar.appendChild(button);
  }
  el.append(bar, out);

  const hook: InteractionHook = { chart, events: [] };
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
      bar.remove();
      out.remove();
      chartEl.remove();
    },
  };
}
