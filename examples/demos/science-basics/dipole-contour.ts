import { createChart, type Chart, type ContourTrace, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { CHARGE, CHARGES, DIVERGING, K_COULOMB } from './waves-fields-planets.mts';

/**
 * The electric potential (the "electrical height", in volts) around a positive and a negative
 * charge of 1 nC, 4 cm apart: `V = k·q/r1 − k·q/r2` on a 181 × 121 grid, as a filled `contour`
 * with labelled lines every 100 V (`contours.showlabels`) and a diverging colorscale centered on
 * 0 V. The potential rises without limit at a point charge, so values are clipped at ±650 V to
 * keep the levels readable. The charges are `scatter` markers with "+" and "−" as text, and the
 * axes share one scale (`yaxis.scaleanchor`).
 */
export const meta: ExampleMeta = {
  title: 'Electricity: potential around two charges',
  description:
    'Contour map of the electric potential in volts around a +1 nC and a −1 nC charge 4 cm apart, with labelled levels.',
  tags: ['demo', 'contour', 'scatter', 'colorscale', 'labels', 'scaleanchor', 'physics'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const CLIP = 650; // V

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const x = linspace(-6, 6, 181);
  const y = linspace(-4, 4, 121);
  // Distances are in cm on the chart, in metres in the formula.
  const z = y.map((yy) =>
    x.map((xx) => {
      const v = CHARGES.reduce(
        (sum, c) =>
          sum + (c.sign * K_COULOMB * CHARGE) / (Math.max(Math.hypot(xx - c.x, yy), 1e-3) / 100),
        0,
      );
      return Math.max(-CLIP, Math.min(CLIP, v));
    }),
  );

  const potential: ContourTrace = {
    type: 'contour',
    x,
    y,
    z,
    zmin: -CLIP,
    zmax: CLIP,
    colorscale: DIVERGING,
    contours: {
      start: -600,
      end: 600,
      size: 100,
      showlabels: true,
      labelformat: 'd',
      labelfont: { size: 9, color: LOOK.title },
    },
    line: { width: 0.75, color: 'rgba(236, 238, 244, 0.45)' },
    colorbar: {
      title: { text: 'Potential (V)', side: 'right' },
      tickvals: [-600, -400, -200, 0, 200, 400, 600],
      thickness: 12,
    },
    hovertemplate: 'x %{x:.1f} cm, y %{y:.1f} cm<br><b>%{z:+.0f} V</b><extra></extra>',
  };
  const charges: ScatterTrace = {
    type: 'scatter',
    mode: 'markers+text',
    x: CHARGES.map((c) => c.x),
    y: [0, 0],
    text: CHARGES.map((c) => `<b>${c.label}</b>`),
    textposition: 'middle center',
    textfont: { color: LOOK.bg, size: 15 },
    marker: { color: LOOK.title, size: 18, line: { color: LOOK.bg, width: 1.5 } },
    customdata: CHARGES.map((c) => c.name),
    hovertemplate: 'Charge of %{customdata}<extra></extra>',
    showlegend: false,
  };

  const chart: Chart = createChart(chartEl, {
    data: [potential, charges],
    layout: {
      title: {
        text: narrow ? '' : 'Electric potential around a positive and a negative charge (±1 nC)',
      },
      xaxis: { title: { text: 'x (cm)' }, range: [-6, 6], constrain: 'domain', showgrid: false },
      yaxis: {
        title: { text: 'y (cm)' },
        range: [-4, 4],
        scaleanchor: 'x',
        constrain: 'domain',
        showgrid: false,
        zeroline: false,
      },
      annotations: [
        {
          x: 0,
          y: 3.5,
          showarrow: false,
          text: '0 V everywhere halfway between the charges',
          font: { size: 11, color: LOOK.title },
          bgcolor: 'rgba(10, 10, 15, 0.7)',
        },
      ],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
