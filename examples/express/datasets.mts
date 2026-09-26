import { gaussian, rng } from '../_lib/rng.ts';

/**
 * Deterministic, synthetic stand-ins for the tables plotly.py's Express examples use, as row
 * objects (the input Express takes). Not real data. A `.mts` file so the example registry does not
 * list it.
 */

export { tips, type TipRow } from '../strip/tips.mts';

/** One row of the iris-like table: four measurements (cm) and the species. */
export interface IrisRow {
  sepal_length: number;
  sepal_width: number;
  petal_length: number;
  petal_width: number;
  species: 'setosa' | 'versicolor' | 'virginica';
}

const SPECIES = [
  { name: 'setosa', mean: [5.0, 3.4, 1.46, 0.24], sd: [0.35, 0.38, 0.17, 0.1] },
  { name: 'versicolor', mean: [5.9, 2.8, 4.26, 1.33], sd: [0.52, 0.31, 0.47, 0.2] },
  { name: 'virginica', mean: [6.6, 3.0, 5.55, 2.03], sd: [0.64, 0.32, 0.55, 0.27] },
] as const;

/** 50 iris-like flowers per species; petal size tracks sepal size. */
export function iris(): IrisRow[] {
  const rows: IrisRow[] = [];
  SPECIES.forEach((s, k) => {
    const normal = gaussian(rng(k + 1));
    for (let i = 0; i < 50; i++) {
      const size = normal();
      const v = s.mean.map((m, d) => {
        const shared = d === 1 ? 0.4 : 0.7;
        const x = m + s.sd[d]! * (shared * size + Math.sqrt(1 - shared * shared) * normal());
        return Math.round(x * 10) / 10;
      });
      rows.push({
        sepal_length: v[0]!,
        sepal_width: v[1]!,
        petal_length: v[2]!,
        petal_width: Math.max(0.1, v[3]!),
        species: s.name,
      });
    }
  });
  return rows;
}

/** One row of the Gapminder-like table: a country in a year. */
export interface GapminderRow {
  country: string;
  continent: string;
  year: number;
  lifeExp: number;
  pop: number;
  gdpPercap: number;
}

const CONTINENTS = [
  { name: 'Africa', count: 9, gdp: [350, 2500], life: [36, 46], growth: 0.012 },
  { name: 'Americas', count: 7, gdp: [1800, 12000], life: [46, 66], growth: 0.018 },
  { name: 'Asia', count: 9, gdp: [500, 5000], life: [38, 58], growth: 0.034 },
  { name: 'Europe', count: 8, gdp: [3000, 12000], life: [60, 70], growth: 0.026 },
  { name: 'Oceania', count: 3, gdp: [8000, 11000], life: [67, 70], growth: 0.021 },
] as const;

/**
 * Countries on five continents every five years from 1952 to 2007, in long form (one row per
 * country and year, like `px.data.gapminder()`), growing along smooth, noisy trajectories.
 */
export function gapminder(): GapminderRow[] {
  const random = rng(1952);
  const noise = gaussian(rng(2007));
  const rows: GapminderRow[] = [];
  for (const c of CONTINENTS) {
    for (let k = 0; k < c.count; k++) {
      const gdp0 = c.gdp[0] * (c.gdp[1] / c.gdp[0]) ** random();
      const life0 = c.life[0] + (c.life[1] - c.life[0]) * random();
      const pop0 = 1e6 * 10 ** (random() * 2.3);
      const growth = c.growth * (0.5 + random());
      const popGrowth = 0.01 + 0.02 * random();
      for (let i = 0; i < 12; i++) {
        const years = 5 * i;
        rows.push({
          country: `${c.name} ${k + 1}`,
          continent: c.name,
          year: 1952 + years,
          lifeExp:
            Math.round((82 - (82 - life0) * Math.exp(-0.012 * years) + 0.6 * noise()) * 10) / 10,
          pop: Math.round(pop0 * Math.exp(popGrowth * years)),
          gdpPercap: Math.round(gdp0 * Math.exp(growth * years + 0.06 * noise())),
        });
      }
    }
  }
  // Year-major, as the source table is sorted.
  return rows.sort((a, b) => a.year - b.year);
}

/** Three samples of different shapes for distribution plots. */
export function samples(): { values: number[][]; labels: string[] } {
  const normal = gaussian(rng(11));
  const a = Array.from({ length: 200 }, () => normal());
  const b = Array.from({ length: 200 }, () => 2 + 0.6 * normal());
  // Bimodal.
  const c = Array.from({ length: 200 }, (_, i) => (i % 2 ? -2 : 1) + 0.5 * normal());
  return { values: [a, b, c], labels: ['Group 1', 'Group 2', 'Group 3'] };
}
