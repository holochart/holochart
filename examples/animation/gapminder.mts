import type { FigureInput } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';

/**
 * A deterministic, synthetic stand-in for the Gapminder data plotly's animation examples use:
 * countries on five continents, every five years from 1952 to 2007, with GDP per capita, life
 * expectancy and population that grow along smooth, noisy trajectories. Not real data: the
 * countries are numbered ("Asia 3"). A `.mts` file so the example registry does not list it.
 */

export const YEARS = Array.from({ length: 12 }, (_, i) => 1952 + 5 * i);

const CONTINENTS = [
  { name: 'Africa', count: 9, gdp: [350, 2500], life: [36, 46], growth: 0.012 },
  { name: 'Americas', count: 7, gdp: [1800, 12000], life: [46, 66], growth: 0.018 },
  { name: 'Asia', count: 9, gdp: [500, 5000], life: [38, 58], growth: 0.034 },
  { name: 'Europe', count: 8, gdp: [3000, 12000], life: [60, 70], growth: 0.026 },
  { name: 'Oceania', count: 3, gdp: [8000, 11000], life: [67, 70], growth: 0.021 },
] as const;

interface Country {
  readonly name: string;
  /** Per year: GDP per capita ($), life expectancy (years), population. */
  readonly gdp: number[];
  readonly life: number[];
  readonly pop: number[];
}

function countries(): { continent: string; countries: Country[] }[] {
  const random = rng(1952);
  const noise = gaussian(rng(2007));
  return CONTINENTS.map((c) => ({
    continent: c.name,
    countries: Array.from({ length: c.count }, (_, k) => {
      const gdp0 = c.gdp[0] * (c.gdp[1] / c.gdp[0]) ** random();
      const life0 = c.life[0] + (c.life[1] - c.life[0]) * random();
      const pop0 = 1e6 * 10 ** (random() * 2.3);
      const growth = c.growth * (0.5 + random());
      const popGrowth = 0.01 + 0.02 * random();
      const gdp: number[] = [];
      const life: number[] = [];
      const pop: number[] = [];
      YEARS.forEach((_, i) => {
        const years = 5 * i;
        gdp.push(gdp0 * Math.exp(growth * years + 0.06 * noise()));
        // Life expectancy rises toward ~82 years, faster where it starts low.
        life.push(82 - (82 - life0) * Math.exp(-0.012 * years) + 0.6 * noise());
        pop.push(pop0 * Math.exp(popGrowth * years));
      });
      return { name: `${c.name} ${k + 1}`, gdp, life, pop };
    }),
  }));
}

/** Options of {@link gapminderFigure}: frame and transition durations of the controls. */
export interface GapminderOptions {
  /** Time between frames while playing (ms). */
  readonly frameDuration?: number;
  /** Transition into each frame (ms). */
  readonly transitionDuration?: number;
}

/**
 * The Gapminder-style figure: one bubble trace per continent (x: GDP per capita on a log axis, y:
 * life expectancy, size: population, `ids`: the countries), one frame per year, a Play / Pause
 * update menu and a year slider, as in plotly's animation examples.
 */
export function gapminderFigure(options: GapminderOptions = {}): FigureInput {
  const frameDuration = options.frameDuration ?? 600;
  const transitionDuration = options.transitionDuration ?? 450;
  const data = countries();
  const maxPop = Math.max(...data.flatMap((c) => c.countries.flatMap((k) => k.pop)));
  // Plotly's area sizing: the most populous country is drawn 44 px across.
  const sizeref = (2 * maxPop) / 44 ** 2;
  const traceAt = (i: number) =>
    data.map((c) => ({
      x: c.countries.map((k) => k.gdp[i] as number),
      y: c.countries.map((k) => k.life[i] as number),
      ids: c.countries.map((k) => k.name),
      text: c.countries.map((k) => k.name),
      marker: { size: c.countries.map((k) => k.pop[i] as number) },
    }));
  const first = traceAt(0);
  return {
    data: data.map((c, k) => ({
      type: 'scatter',
      mode: 'markers',
      name: c.continent,
      ...first[k],
      marker: { ...first[k]?.marker, sizemode: 'area', sizeref, sizemin: 3 },
      hovertemplate:
        '%{text}<br>GDP per capita $%{x:,.0f}<br>Life expectancy %{y:.1f}<extra></extra>',
    })),
    layout: {
      title: { text: 'Life expectancy and income, 1952–2007 (synthetic)' },
      xaxis: {
        type: 'log',
        range: [Math.log10(250), Math.log10(60000)],
        tickvals: [300, 1000, 3000, 10000, 30000],
        tickprefix: '$',
        title: { text: 'GDP per capita (log scale)' },
      },
      yaxis: { range: [25, 88], title: { text: 'Life expectancy (years)' } },
      margin: { b: 120 },
      updatemenus: [
        {
          type: 'buttons',
          direction: 'left',
          showactive: false,
          x: 0,
          xanchor: 'left',
          y: -0.2,
          yanchor: 'top',
          pad: { t: 12 },
          buttons: [
            {
              label: 'Play',
              method: 'animate',
              args: [
                null,
                {
                  frame: { duration: frameDuration, redraw: false },
                  transition: { duration: transitionDuration, easing: 'cubic-in-out' },
                  fromcurrent: true,
                },
              ],
            },
            {
              label: 'Pause',
              method: 'animate',
              args: [
                [null],
                {
                  mode: 'immediate',
                  frame: { duration: 0, redraw: false },
                  transition: { duration: 0 },
                },
              ],
            },
          ],
        },
      ],
      sliders: [
        {
          active: 0,
          x: 0.16,
          len: 0.84,
          y: -0.2,
          yanchor: 'top',
          pad: { t: 12 },
          currentvalue: { prefix: 'Year: ', xanchor: 'right' },
          transition: { duration: transitionDuration, easing: 'cubic-in-out' },
          steps: YEARS.map((year) => ({
            label: String(year),
            method: 'animate',
            args: [
              [String(year)],
              {
                mode: 'immediate',
                frame: { duration: transitionDuration, redraw: false },
                transition: { duration: transitionDuration },
              },
            ],
          })),
        },
      ],
    },
    frames: YEARS.map((year, i) => ({ name: String(year), data: traceAt(i) })),
  };
}
