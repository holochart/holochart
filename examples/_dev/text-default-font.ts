import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from '../_lib/fonts.ts';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Text measured with the font that is drawn (E2.18). Unlike the other chart examples, no
 * `font.family` is set anywhere, so every label uses Plotly's default family list
 * (`"Open Sans", verdana, arial, sans-serif`), which is not registered: troika draws it with the
 * default font (vendored Inter Regular, via `configureText({ defaultFontURL })`) and the metrics
 * oracle must measure with that same font, not with whatever system font matches the CSS list.
 * Long legend entries and axis titles make a width mismatch visible as clipped or misplaced text.
 */
export const meta: ExampleMeta = {
  title: 'Text: default font family (unregistered) measured as drawn',
  description:
    'Legend, axis titles and title with the default layout font family: measured and drawn with the default font.',
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

export function run(el: HTMLElement): ExampleHandle {
  // Only sets the default font URL (and registers Inter, which this figure never names).
  useExampleFonts();
  let chart: Chart | undefined = createChart(el, {
    data: [
      { mode: 'lines+markers', name: 'Revenue, all regions (actual)', ...series(11, 40, 4, 1) },
      { mode: 'lines+markers', name: '2025 target', ...series(11, 35, 5, 2) },
      {
        mode: 'markers',
        name: 'Wide glyphs: WWMMWW mmww',
        marker: { symbol: 'square', size: 8 },
        ...series(11, 60, 1.5, 3),
      },
    ],
    layout: {
      margin: { l: 60, r: 20, t: 50, b: 50 },
      title: { text: 'Default font family, no registration', x: 0.04 },
      legend: { bordercolor: '#9aa7b8', borderwidth: 1, bgcolor: '#fbfcfe' },
      xaxis: { title: { text: 'Fiscal year (ending December)' }, automargin: true },
      yaxis: { title: { text: 'Millions of USD' }, automargin: true },
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
