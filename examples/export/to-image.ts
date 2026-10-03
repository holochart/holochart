import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Raster export with `chart.toImage`: a chart with every kind of content (traces, axes, text, a
 * legend, an annotation, a shape and a layout image) and a row of buttons that export it as PNG,
 * JPEG or WebP, at 2×, with a transparent background or at another size. Each export is shown
 * under the buttons, newest first, over a checkerboard so transparency shows. The modebar's
 * camera button downloads with `config.toImageButtonOptions` (here: 2×, `holochart-export.png`).
 *
 * The figure is drawn again offscreen at the requested size, so the images never contain the
 * modebar or hover labels.
 */
export const meta: ExampleMeta = {
  title: 'Export: images with toImage',
  description:
    'Export a chart with traces, a legend, an annotation, a shape and an image to PNG, JPEG or WebP, at 2×, at another size or with a transparent background.',
  tags: ['export', 'toimage', 'config', 'line', 'bar'],
  size: { width: 640, height: 520 },
  // The buttons are DOM text, rasterized by the OS, whose fonts differ between machines.
  testTolerance: 0.006,
};

const LOGO = new URL('../_lib/assets/logo.png', import.meta.url).href;

const VARIANTS = [
  ['PNG', {}],
  ['JPEG', { format: 'jpeg' }],
  ['WebP', { format: 'webp' }],
  ['2×', { scale: 2 }],
  ['Transparent', { transparent: true }],
  ['320×200', { width: 320, height: 200 }],
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chartEl = document.createElement('div');
  chartEl.style.height = '360px';
  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;font:12px/1.4 sans-serif;';
  const out = document.createElement('div');
  out.style.cssText = 'display:flex;gap:8px;height:104px;padding:0 12px;overflow-x:auto;';
  el.append(chartEl, bar, out);

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

  let disposed = false;
  for (const [label, options] of VARIANTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText =
      'font:inherit;color:inherit;background:transparent;padding:3px 10px;' +
      'border:1px solid currentColor;border-radius:4px;cursor:pointer;';
    button.addEventListener('click', () => {
      void chart.toImage(options).then((url) => {
        if (disposed) return;
        const img = document.createElement('img');
        img.src = url;
        img.alt = `${label} export`;
        img.title = label;
        img.style.cssText =
          'height:96px;flex:none;' +
          'background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/16px 16px;';
        out.prepend(img);
      });
    });
    bar.append(button);
  }

  const ready = chart.ready.then(() => {
    // The button row continues the chart's paper, in its colors.
    const full = chart.fullLayout;
    for (const part of [bar, out]) {
      part.style.background = String(full?.paper_bgcolor ?? '');
      part.style.color = String(full?.font.color ?? '');
    }
  });
  return {
    ready,
    renderer: chart.three.renderer,
    dispose: () => {
      disposed = true;
      chart.destroy();
      chartEl.remove();
      bar.remove();
      out.remove();
    },
  };
}
