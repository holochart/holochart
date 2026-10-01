import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminder } from './datasets.mts';

/**
 * Express 3D lines (plan E23.6), as the px docs' `px.line_3d(df, x='gdpPercap', y='pop',
 * z='year', color='country')`: each European country's path through GDP per capita, population
 * and time (population on a log axis), one `scatter3d` line per country in the rows' (year)
 * order, with markers at the points. The data are synthetic.
 */
export const meta: ExampleMeta = {
  title: 'Express: 3D lines per country',
  description:
    'GDP per capita, population and year of eight European countries, one 3D line per country.',
  tags: ['express', 'scatter3d', 'line3d', '3d', 'scene', 'lines'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const europe = gapminder().filter((r) => r.continent === 'Europe');
  const figure = hx.line3d(europe, {
    x: 'gdpPercap',
    y: 'pop',
    z: 'year',
    color: 'country',
    markers: true,
    logY: true,
    labels: { gdpPercap: 'GDP per capita', pop: 'Population', year: 'Year', country: 'Country' },
    title: 'European countries over time',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
