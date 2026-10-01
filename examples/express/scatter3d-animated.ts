import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { gapminder } from './datasets.mts';

/**
 * An animated 3D scatter from data (plan E23.4, E23.6): Gapminder-like rows in a scene — GDP per
 * capita and population on log axes, life expectancy up — with `animationFrame: 'year'` and
 * `animationGroup: 'country'`, so each country moves between the yearly frames. Express adds px's
 * ▶ / ◼ buttons and `year=` slider, and fixes the scene's axis ranges over every frame so the box
 * holds still. The data are synthetic.
 *
 * Shown (and tested) on its first frame, 1952.
 */
export const meta: ExampleMeta = {
  title: 'Express: animated 3D scatter',
  description:
    'GDP per capita, population and life expectancy by country in 3D, one frame per year, with play and a slider.',
  tags: ['express', 'scatter3d', '3d', 'scene', 'animation', 'frames', 'sliders'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const figure = hx.scatter3d(gapminder(), {
    x: 'gdpPercap',
    y: 'pop',
    z: 'lifeExp',
    color: 'continent',
    hoverName: 'country',
    animationFrame: 'year',
    animationGroup: 'country',
    logX: true,
    logY: true,
    labels: {
      gdpPercap: 'GDP per capita',
      pop: 'Population',
      lifeExp: 'Life expectancy',
      continent: 'Continent',
    },
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
