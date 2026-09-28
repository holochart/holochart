import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminder } from './datasets.mts';

/**
 * Express sunburst from a path (plan E13.1, E23.6): `px.sunburst(df, path=['continent',
 * 'country'], values='pop', color='lifeExp')` on the synthetic Gapminder table's 2007 rows. The
 * `path` columns become ids, labels and parents (a continent per ring sector, its countries
 * outside it), populations add up (`branchvalues: 'total'`), and each continent takes its
 * countries' population-weighted mean life expectancy on a diverging colorscale centered on the
 * world average.
 */
export const meta: ExampleMeta = {
  title: 'Express: sunburst from a path',
  description:
    'Countries by continent sized by population and colored by life expectancy, built from a path of columns.',
  tags: ['express', 'sunburst', 'hierarchical', 'path', 'colorscale', 'colorbar'],
  size: { width: 640, height: 520 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,−- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  const rows = gapminder().filter((r) => r.year === 2007);
  const pop = rows.reduce((s, r) => s + r.pop, 0);
  const average = rows.reduce((s, r) => s + r.lifeExp * r.pop, 0) / pop;
  const figure = hx.sunburst(rows, {
    path: ['continent', 'country'],
    values: 'pop',
    color: 'lifeExp',
    colorContinuousScale: 'RdBu',
    colorContinuousMidpoint: average,
    labels: { lifeExp: 'Life expectancy' },
    title: 'Population and life expectancy, 2007',
  });
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, figure);
    await componentsReady(chart);
  });
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
