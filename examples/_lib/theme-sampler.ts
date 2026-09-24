import { componentsReady, createChart, type Chart } from '@mk7s/holochart';
import { useExampleFonts } from './fonts.ts';
import { rng } from './rng.ts';
import type { ExampleHandle, ExampleMeta, ExampleModule } from './types.ts';

/**
 * The "theme sampler" figure (plan E8.1): one chart that shows everything a theme styles, rendered
 * once per built-in theme by the thin wrappers in `examples/themes/` (each a visual baseline).
 *
 * - Left subplot: grouped bars (bar outlines, category axis) under a lines+markers trace (line
 *   width, markers, zero line through the negative bar).
 * - Right subplot: markers whose numbers map through the theme's automatic sequential colorscale
 *   (`layout.colorscale.sequential`, `colorscaleInterpolation`) with a colorbar, plus a plain
 *   marker trace.
 * - A title, axis titles on every axis, and a horizontal legend above the plots.
 *
 * Only the font family is fixed (the vendored Inter, so baselines are deterministic); sizes and
 * colors come from the theme.
 */
export function themeSampler(theme: string): ExampleModule {
  const meta: ExampleMeta = {
    title: `Theme: ${theme}`,
    description: `The theme sampler figure with layout.template: '${theme}' — bars, lines, markers, a colorscale with a colorbar, legend, title and axis titles on two subplots.`,
    tags: ['themes', 'template', 'styling', theme],
    size: { width: 720, height: 440 },
    testTolerance: 0.004,
  };
  return { meta, run: (el) => runSampler(el, theme) };
}

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

function runSampler(el: HTMLElement, theme: string): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const random = rng(8);

  const n = 40;
  const sx = Float64Array.from({ length: n }, () => random() * 10);
  const sy = Float64Array.from(sx, (v) => 2 + v * 0.6 + (random() - 0.5) * 4);
  const value = Float64Array.from(sy, (v, i) => Math.max(0, v + sx[i]! * 0.5));
  const px = Float64Array.from({ length: 12 }, () => 1 + random() * 8);
  const py = Float64Array.from(px, (v) => 9 - v * 0.4 + random() * 2);

  const ready = (async () => {
    useExampleFonts();
    await document.fonts.load('12px Inter');
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { type: 'bar', name: '2025', x: QUARTERS, y: [4, 7, 5, -2, 6] },
        { type: 'bar', name: '2026', x: QUARTERS, y: [5, 6, 8, 3, 7] },
        {
          type: 'scatter',
          name: 'target',
          mode: 'lines+markers',
          x: QUARTERS,
          y: [5, 6.5, 7, 5.5, 8],
        },
        {
          type: 'scatter',
          name: 'observed',
          mode: 'markers',
          x: sx,
          y: sy,
          xaxis: 'x2',
          yaxis: 'y2',
          marker: {
            size: 9,
            color: value,
            showscale: true,
            colorbar: { title: { text: 'score' }, len: 0.8 },
          },
        },
        {
          type: 'scatter',
          name: 'reference',
          mode: 'markers',
          x: px,
          y: py,
          xaxis: 'x2',
          yaxis: 'y2',
          marker: { size: 7, symbol: 'diamond' },
        },
      ],
      layout: {
        template: theme,
        // Pinned to the top so the legend fits between the title and the plots.
        title: { text: `Theme sampler: ${theme}`, y: 0.97, yanchor: 'top' },
        font: { family: 'Inter' },
        // Small margins that axis titles, the colorbar and the legend grow as each theme's fonts
        // and ticks need (automargin), so every theme gets a tidy layout from the same figure.
        margin: { l: 20, r: 20, t: 100, b: 20 },
        barmode: 'group',
        xaxis: { domain: [0, 0.42], title: { text: 'Quarter' }, automargin: true },
        yaxis: { title: { text: 'Revenue' }, automargin: true },
        xaxis2: { domain: [0.56, 1], anchor: 'y2', title: { text: 'Effort' }, automargin: true },
        yaxis2: { anchor: 'x2', title: { text: 'Outcome' }, automargin: true },
        legend: { orientation: 'h', x: 0, xanchor: 'left', y: 1.03, yanchor: 'bottom' },
        showlegend: true,
      },
    });
    await componentsReady(chart);
  })();

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
