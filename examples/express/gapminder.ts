import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminder } from './datasets.mts';

/**
 * Animation from data (plan E23.4): the Gapminder bubble chart built from long-form rows with
 * `animationFrame: 'year'` and `animationGroup: 'country'`, as `px.scatter` builds it — one frame
 * per year, `ids` so each country glides between frames, a ▶ / ◼ update menu and a `year=` slider
 * that follows playback, and axis ranges fixed to every year's data. The data are synthetic.
 *
 * Shown (and tested) on its first frame, 1952.
 */
export const meta: ExampleMeta = {
  title: 'Express: animated Gapminder from rows',
  description:
    'Life expectancy against GDP per capita by country, one frame per year, with play and a year slider.',
  tags: ['express', 'animation', 'frames', 'bubble', 'scatter', 'sliders', 'updatemenus'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter(gapminder(), {
    x: 'gdpPercap',
    y: 'lifeExp',
    size: 'pop',
    color: 'continent',
    hoverName: 'country',
    animationFrame: 'year',
    animationGroup: 'country',
    logX: true,
    sizeMax: 40,
    labels: { gdpPercap: 'GDP per capita', lifeExp: 'Life expectancy', pop: 'Population' },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
