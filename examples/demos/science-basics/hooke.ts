import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { G, normal, rng } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Hooke's law from a simulated school experiment: masses of 50 to 500 g are hung on a spring and
 * the stretch is measured. The "measurements" are made up with a seeded generator: the true
 * extension F / k for a spring constant k of 25 N/m (F = m g, g = 9.81 m/s²) plus normal noise
 * of 0.3 cm. They are `scatter` markers with `error_y` bars of ±0.4 cm (the reading error of a
 * ruler); the line is the least-squares fit through the origin, slope = Σxy / Σx², drawn as a
 * second `scatter` trace, and its spring constant is stated in an annotation.
 *
 * Stretch is proportional to force: twice the weight, twice the stretch.
 */
export const meta: ExampleMeta = {
  title: 'Forces: stretching a spring',
  description:
    'Simulated measurements of a spring’s extension against the force on it, with error bars and the best-fit line through the origin.',
  tags: ['demo', 'scatter', 'markers', 'error bars', 'fit', 'annotations', 'simulated'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const K_TRUE = 25; // N/m
const NOISE = 0.3; // cm
const ERROR = 0.4; // cm

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const noise = normal(rng(1660));
  const grams = Array.from({ length: 10 }, (_, i) => 50 * (i + 1));
  const force = grams.map((m) => (m / 1000) * G);
  const stretch = force.map((f) => (f / K_TRUE) * 100 + NOISE * noise());
  // Least squares for y = a x: a = Σxy / Σx², in cm per newton.
  const slope =
    force.reduce((s, f, i) => s + f * (stretch[i] as number), 0) /
    force.reduce((s, f) => s + f * f, 0);
  const k = 100 / slope;

  const fit: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Best-fit line through the origin',
    x: [0, 5.2],
    y: [0, 5.2 * slope],
    line: { color: LOOK.colorway[0], width: 2 },
    hoverinfo: 'skip',
  };
  const points: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Measured (simulated)',
    x: force,
    y: stretch,
    customdata: grams,
    error_y: { type: 'constant', value: ERROR, color: LOOK.text, thickness: 1.25, width: 4 },
    marker: { color: LOOK.colorway[1], size: 8, line: { color: LOOK.title, width: 1 } },
    hovertemplate:
      '%{customdata} g hung on the spring<br>force %{x:.2f} N' +
      `<br>stretch <b>%{y:.1f} cm</b> ± ${ERROR} cm<extra></extra>`,
  };

  const chart: Chart = createChart(chartEl, {
    data: [fit, points],
    layout: {
      title: {
        text: narrow ? '' : 'A spring stretches in proportion to the force (simulated readings)',
      },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { title: { text: 'Force on the spring (N)' }, range: [0, 5.2], zeroline: false },
      yaxis: { title: { text: 'Extension (cm)' }, range: [0, 22], zeroline: false },
      annotations: [
        {
          x: 3.6,
          y: 3.6 * slope,
          ax: 60,
          ay: 56,
          text:
            `Slope ${slope.toFixed(2)} cm per newton,<br>` +
            `so the spring constant k = <b>${k.toFixed(1)} N/m</b>`,
          align: 'left',
          arrowcolor: LOOK.text,
          arrowwidth: 1,
          font: { size: 11, color: LOOK.title },
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
