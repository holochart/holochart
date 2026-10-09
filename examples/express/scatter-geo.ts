import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import hx from '@mk7s/holochart-express';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Express map of markers (backlog GEO7): `px.scatter_geo` on a table of countries — each marker at
 * the place its ISO-3 code names (`locations`), one `scattergeo` trace per continent by color with
 * a legend, marker areas by population, the country in the hover label. Maps are not part of the
 * full bundle (ADR-026): the second import registers them.
 */
export const meta: ExampleMeta = {
  title: 'Express: markers on a map',
  description:
    'The most populous countries at their ISO-3 locations, colored by continent and sized by population.',
  tags: ['express', 'scattergeo', 'geo', 'map', 'locations', 'grouping'],
  size: { width: 760, height: 480 },
  testTolerance: 0.004,
};

/** ISO-3 code, name, continent, population in millions (2023, rounded). */
const COUNTRIES: readonly (readonly [string, string, string, number])[] = [
  ['IND', 'India', 'Asia', 1429],
  ['CHN', 'China', 'Asia', 1411],
  ['IDN', 'Indonesia', 'Asia', 278],
  ['PAK', 'Pakistan', 'Asia', 240],
  ['JPN', 'Japan', 'Asia', 124],
  ['USA', 'United States', 'Americas', 335],
  ['BRA', 'Brazil', 'Americas', 216],
  ['MEX', 'Mexico', 'Americas', 128],
  ['ARG', 'Argentina', 'Americas', 46],
  ['CAN', 'Canada', 'Americas', 40],
  ['NGA', 'Nigeria', 'Africa', 224],
  ['ETH', 'Ethiopia', 'Africa', 127],
  ['EGY', 'Egypt', 'Africa', 113],
  ['COD', 'DR Congo', 'Africa', 102],
  ['ZAF', 'South Africa', 'Africa', 60],
  ['RUS', 'Russia', 'Europe', 144],
  ['DEU', 'Germany', 'Europe', 84],
  ['FRA', 'France', 'Europe', 68],
  ['GBR', 'United Kingdom', 'Europe', 68],
  ['AUS', 'Australia', 'Oceania', 27],
];

export function run(el: HTMLElement): ExampleHandle {
  const rows = COUNTRIES.map(([iso, country, continent, pop]) => ({
    iso,
    country,
    continent,
    pop,
  }));
  const figure = hx.scatterGeo(rows, {
    locations: 'iso',
    color: 'continent',
    size: 'pop',
    sizeMax: 36,
    hoverName: 'country',
    projection: 'natural earth',
    // The whole world, not only the part the markers cover.
    fitBounds: false,
    labels: { pop: 'Population (millions)', continent: 'Continent', iso: 'ISO code' },
    title: 'Most populous countries',
  });
  const chart = createChart(el, figure);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
