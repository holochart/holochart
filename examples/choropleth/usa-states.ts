import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A choropleth of US states (backlog GEO4): `locationmode: 'USA-states'` reads `locations` as
 * postal codes (or state names), on the scoped map of the United States (`scope: 'usa'`, the
 * Albers USA projection with Alaska and Hawaii as insets).
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: US states',
  description: 'US states colored by population, named by postal code.',
  tags: ['geo', 'choropleth', 'usa', 'colorscale', 'colorbar', 'map'],
  testTolerance: 0.004,
};

/** Resident population in millions by postal code, 2020 census, rounded. */
const POPULATION = `
  CA 39.5  TX 29.1  FL 21.5  NY 20.2  PA 13.0  IL 12.8  OH 11.8  GA 10.7  NC 10.4  MI 10.1  NJ 9.3
  VA 8.6   WA 7.7   AZ 7.2   MA 7.0   TN 6.9   IN 6.8   MD 6.2   MO 6.2   WI 5.9   CO 5.8   MN 5.7
  SC 5.1   AL 5.0   LA 4.7   KY 4.5   OR 4.2   OK 4.0   CT 3.6   UT 3.3   IA 3.2   NV 3.1   AR 3.0
  MS 3.0   KS 2.9   NM 2.1   NE 2.0   ID 1.8   WV 1.8   HI 1.5   NH 1.4   ME 1.4   RI 1.1   MT 1.1
  DE 1.0   SD 0.9   ND 0.8   AK 0.7   DC 0.7   VT 0.6   WY 0.6
`
  .trim()
  .split(/\s+/);
/** The codes, and the value after each. */
const LOCATIONS = POPULATION.filter((_, i) => i % 2 === 0);
const VALUES = POPULATION.filter((_, i) => i % 2 === 1).map(Number);

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locationmode: 'USA-states',
        locations: LOCATIONS,
        z: VALUES,
        name: 'population',
        hovertemplate: '%{location}: %{z} M<extra></extra>',
        colorbar: { title: { text: 'millions' } },
      },
    ],
    layout: {
      title: { text: 'Population by state, 2020' },
      geo: { scope: 'usa', fitbounds: false },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
