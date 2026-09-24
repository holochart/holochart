import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { INTER, registerInter } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A custom web font (plan E8.3): `fonts.register('Inter', { regular, bold, italic, boldItalic })`
 * (see `_lib/fonts.ts`), then `layout.font.family` names it, so every label (ticks, legend, axis
 * and figure titles, annotations) is drawn and measured with Inter instead of the shipped default
 * font; the bold and italic annotations at the top left load the other registered faces. The
 * bottom-right annotation sets the default look's family list back, which no registered
 * family matches, so it is drawn with the default font (TeX Gyre Heros) for comparison.
 */
export const meta: ExampleMeta = {
  title: 'Text: a registered web font',
  description:
    'Inter registered with fonts.register and named in layout.font.family; one annotation keeps the default font for comparison.',
  tags: ['dev', 'chart', 'text', 'fonts'],
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
  'Inter regular',
  '<b>Inter bold</b>',
  '<i>Inter italic</i>',
  '<b><i>Inter bold italic</i></b>',
];

export function run(el: HTMLElement): ExampleHandle {
  registerInter();
  let chart: Chart | undefined = createChart(el, {
    data: [
      { mode: 'lines+markers', name: 'Revenue, all regions (actual)', ...series(11, 40, 4, 1) },
      { mode: 'lines+markers', name: '2025 target', ...series(11, 35, 5, 2) },
      { mode: 'markers', name: 'Wide glyphs: WWMMWW mmww', ...series(11, 60, 1.5, 3) },
    ],
    layout: {
      font: { family: `${INTER}, sans-serif` },
      title: { text: 'Inter, registered with fonts.register' },
      xaxis: { title: { text: 'Fiscal year (ending December)' } },
      yaxis: { title: { text: 'Millions of USD' } },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 0,
          xanchor: 'right',
          yanchor: 'bottom',
          showarrow: false,
          text: 'Default font (TeX Gyre Heros): WWMMWW mmww',
          font: { family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
        },
        // Whole-text bold / italic (runs inside one label are drawn in one face).
        ...FACES.map((text, i) => ({
          xref: 'paper' as const,
          yref: 'paper' as const,
          x: 0,
          y: 1,
          xanchor: 'left' as const,
          yanchor: 'top' as const,
          yshift: -i * 12,
          showarrow: false,
          text,
        })),
      ],
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
