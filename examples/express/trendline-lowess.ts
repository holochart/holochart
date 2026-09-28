import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminder } from './datasets.mts';

/**
 * Express LOWESS trendline (plan E23.5): `trendline: 'lowess'` smooths life expectancy against
 * income with Cleveland's locally weighted regression (statsmodels' algorithm: tricube weights,
 * three robustifying passes), and `trendlineScope: 'overall'` fits one curve through every
 * continent's countries, drawn as `Overall Trendline` with its own legend entry. `frac` sets the
 * share of points in each local fit.
 */
export const meta: ExampleMeta = {
  title: 'Express: LOWESS trendline over all groups',
  description:
    'Life expectancy against GDP per capita on a log axis, colored by continent, with one LOWESS curve through all countries.',
  tags: ['express', 'scatter', 'trendline', 'lowess', 'smoothing', 'log axis'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = gapminder().filter((r) => r.year === 2007);
  const figure = hx.scatter(rows, {
    x: 'gdpPercap',
    y: 'lifeExp',
    color: 'continent',
    hoverName: 'country',
    logX: true,
    trendline: 'lowess',
    trendlineOptions: { frac: 0.5 },
    trendlineScope: 'overall',
    labels: { gdpPercap: 'GDP per capita', lifeExp: 'Life expectancy' },
    title: 'Life expectancy and income, 2007',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
