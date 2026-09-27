import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A matrix as a heatmap (plan E23.6): `px.imshow` of a 2D array with `text_auto`, so every cell
 * shows its value. The rows run down from the top as in the matrix, cells are square
 * (`aspect: 'equal'`), and the colorscale spans the data (`contrast_rescaling: 'minmax'`) on the
 * figure's `coloraxis`.
 */
export const meta: ExampleMeta = {
  title: 'Express: imshow of a matrix',
  description: 'Average monthly rainfall per city as a labelled heatmap, one row per city.',
  tags: ['express', 'imshow', 'heatmap', 'coloraxis', 'texttemplate'],
  size: { width: 720, height: 400 },
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CITIES = ['Seattle', 'Denver', 'Miami', 'Chicago', 'Phoenix'];

/** Synthetic rainfall (mm): a seasonal cycle per city, peaking in a different month. */
function rainfall(): number[][] {
  const cities = [
    { mean: 95, amplitude: 70, peak: 11 },
    { mean: 38, amplitude: 20, peak: 5 },
    { mean: 130, amplitude: 90, peak: 8 },
    { mean: 85, amplitude: 25, peak: 6 },
    { mean: 18, amplitude: 10, peak: 7 },
  ];
  return cities.map(({ mean, amplitude, peak }) =>
    MONTHS.map((_, m) => Math.round(mean + amplitude * Math.cos(((m - peak) / 12) * 2 * Math.PI))),
  );
}

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.imshow(rainfall(), {
    x: MONTHS,
    y: CITIES,
    textAuto: true,
    colorContinuousScale: 'Blues',
    labels: { x: 'Month', color: 'Rain (mm)' },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
