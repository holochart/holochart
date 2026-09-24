import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Text measured with the font that is drawn (E2.18, ADR-021). No font is set up anywhere: the
 * default template's family list (`'Helvetica Neue', Helvetica, Arial, sans-serif`) names no
 * registered family, so troika draws every label with the renderer's shipped default font, TeX Gyre
 * Heros (loaded lazily, one face per weight and style, never from a CDN), and the metrics oracle
 * must measure with that same font, not with whatever system font matches the CSS list. Long legend
 * entries and axis titles make a width mismatch visible as clipped or misplaced text; the
 * bold and italic annotations load the other three faces.
 */
export const meta: ExampleMeta = {
  title: 'Text: default font family (unregistered) measured as drawn',
  description:
    'Legend, axis titles and title in the default look with no font set up: measured and drawn with the shipped TeX Gyre Heros.',
  tags: ['dev', 'chart', 'text', 'legend'],
  size: { width: 720, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

function series(n: number, base: number, slope: number, seed: number) {
  const random = rng(seed);
  const x = Float64Array.from({ length: n }, (_, i) => 2015 + i);
  const y = Float64Array.from({ length: n }, (_, i) => base + slope * i + (random() - 0.5) * 6);
  return { x, y };
}

const FACES = [
  'regular face',
  '<b>bold face</b>',
  '<i>italic face</i>',
  '<b><i>bold italic face</i></b>',
];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined = createChart(el, {
    data: [
      { mode: 'lines+markers', name: 'Revenue, all regions (actual)', ...series(11, 40, 4, 1) },
      { mode: 'lines+markers', name: '2025 target', ...series(11, 35, 5, 2) },
      {
        mode: 'markers',
        name: 'Wide glyphs: WWMMWW mmww',
        marker: { symbol: 'square' },
        ...series(11, 60, 1.5, 3),
      },
    ],
    layout: {
      // The bordered legend is taller than the default margin's one legend row under the title.
      margin: { t: 58 },
      title: { text: 'Default font, no registration' },
      legend: { bordercolor: '#3e3e4c', borderwidth: 1, bgcolor: '#15151d' },
      xaxis: { title: { text: 'Fiscal year (ending December)' } },
      yaxis: { title: { text: 'Millions of USD' } },
      // Whole-text bold / italic (runs inside one label are drawn in one face) load the other faces.
      annotations: FACES.map((text, i) => ({
        xref: 'paper',
        yref: 'paper',
        x: 1,
        y: 0,
        xanchor: 'right',
        yanchor: 'bottom',
        yshift: i * 12,
        showarrow: false,
        text,
      })),
    },
  });
  const ready = componentsReady(chart).then(() => undefined);

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      chart?.destroy();
      chart = undefined;
    },
  };
}
