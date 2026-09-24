import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A floating colorbar for large numbers (plan E5.3): soil cores from three field plots, colored by
 * bacterial density (up to ~10⁹ cells per gram). The colorbar writes those numbers in powers of ten
 * (`exponentformat: 'power'`) but prints the exponent only on the top label
 * (`showexponent: 'last'`), so the lower labels stay short mantissas; `nticks` asks for about five
 * of them.
 *
 * The bar floats inside the empty top-right corner of the plot as a key: placed in paper units
 * (`x` / `y` with right / top anchors), a fixed 170 px long (`lenmode: 'pixels'`) and 2.5 % of the
 * plot width thick (`thicknessmode: 'fraction'`), on a translucent panel (`bgcolor`) with a hairline
 * border (`bordercolor`, `borderwidth`) and its own padding (`xpad`, `ypad`). Short, light ticks
 * (`ticklen`, `tickwidth`, `tickcolor`) and small italic small-caps title keep it quiet.
 *
 * Marker rims show measurement confidence: `marker.line.color` numbers run through a transparent to
 * white `marker.line.colorscale` over a fixed 0–1 domain (`cmin` / `cmax`), so low-confidence cores
 * lose their rim.
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: floating key with power-of-ten labels',
  description:
    'Soil cores colored by bacterial density with an in-plot colorbar on a translucent panel, power-of-ten tick labels, and confidence-colored marker rims.',
  tags: ['colorbar', 'scatter', 'colorscale', 'markers'],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

interface Plot {
  cx: number;
  cy: number;
  density: number;
}

const PLOTS: Plot[] = [
  { cx: 2.2, cy: 2.0, density: 2.4e8 },
  { cx: 5.6, cy: 3.2, density: 5.5e8 },
  { cx: 3.6, cy: 6.4, density: 8.2e8 },
];

/** Marker rim: invisible at zero confidence, white at full confidence. */
const RIM: [number, string][] = [
  [0, 'rgba(255, 255, 255, 0)'],
  [1, 'rgba(255, 255, 255, 0.95)'],
];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(508);
  const normal = gaussian(rng(509));
  const x: number[] = [];
  const y: number[] = [];
  const density: number[] = [];
  const confidence: number[] = [];
  for (const p of PLOTS) {
    for (let i = 0; i < 60; i++) {
      const dx = normal() * 0.8;
      const dy = normal() * 0.7;
      x.push(+(p.cx + dx).toFixed(2));
      y.push(+(p.cy + dy).toFixed(2));
      // Density falls off towards the plot edges.
      const falloff = Math.exp(-(dx * dx + dy * dy) / 1.6);
      density.push(Math.round(p.density * (0.35 + 0.65 * falloff) * (0.85 + random() * 0.3)));
      confidence.push(+(0.2 + random() * 0.8).toFixed(2));
    }
  }

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'soil cores',
        x,
        y,
        marker: {
          size: 9,
          color: density,
          line: { color: confidence, colorscale: RIM, cmin: 0, cmax: 1, width: 1.5 },
          showscale: true,
          colorbar: {
            x: 0.985,
            xanchor: 'right',
            y: 0.97,
            yanchor: 'top',
            lenmode: 'pixels',
            len: 170,
            thicknessmode: 'fraction',
            thickness: 0.025,
            bgcolor: 'rgba(14, 15, 22, 0.85)',
            bordercolor: '#4b475c',
            borderwidth: 1,
            xpad: 10,
            ypad: 8,
            nticks: 5,
            ticklen: 3,
            tickwidth: 1,
            tickcolor: '#8a8fa3',
            exponentformat: 'power',
            showexponent: 'last',
            tickfont: { size: 9, color: '#c8cbd6' },
            title: {
              text: 'Cells per gram',
              font: { size: 10, style: 'italic', variant: 'small-caps', color: '#e6e8ef' },
            },
          },
        },
      },
    ],
    layout: {
      title: { text: 'Bacterial density in soil cores, three field plots' },
      showlegend: false,
      xaxis: { title: { text: 'Easting (km)' }, range: [-0.5, 10] },
      yaxis: { title: { text: 'Northing (km)' }, range: [-0.5, 8.5] },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
