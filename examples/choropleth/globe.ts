import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A choropleth on the 3D globe (backlog GEO8): `projection.type: 'globe3d'` draws the map as a
 * lit sphere, and `elevation` gives every region a second value as height. Each country is
 * colored by its median age (`z`, with the colorbar) and rises from the globe as a prism as tall
 * as its income per person (`elevation`): the country with the largest elevation is
 * `elevationscale` globe radii high, the others in proportion. Drag to turn the globe, scroll to
 * zoom; hovering a prism picks what is drawn under the pointer, so a tall country hides the ones
 * behind it and nothing is hit through the globe.
 *
 * The globe and `elevation` are Holochart's own; Plotly has neither. Maps are not in the full
 * bundle: `import '@mk7s/holochart/geo'` adds them.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: extruded regions on a 3D globe',
  description:
    'Countries on a 3D globe, colored by one value and raised into prisms by a second one, with a colorbar.',
  tags: ['geo', 'choropleth', 'globe3d', '3d', 'elevation', 'colorbar', 'map'],
  testTolerance: 0.004,
};

/**
 * ISO-3 code, median age in years, and GDP per person in thousands of US dollars: approximate,
 * rounded values for illustration.
 */
const COUNTRIES = `
  USA 38 81  CAN 41 54  MEX 30 13  GTM 23 5   CUB 42 9   BRA 34 10  ARG 32 13  CHL 36 17
  COL 32 7   PER 30 8   VEN 30 4   BOL 25 4   ECU 29 6   PRY 27 6   URY 36 22  GBR 40 49
  IRL 39 104 FRA 42 44  DEU 46 53  ITA 48 38  ESP 45 33  PRT 46 27  NLD 42 62  BEL 42 53
  CHE 43 100 AUT 44 56  POL 42 22  CZE 43 31  ROU 43 18  GRC 46 23  UKR 41 5   BLR 41 8
  SWE 41 56  NOR 40 88  FIN 43 53  DNK 42 68  RUS 40 14  TUR 33 13  EGY 24 4   LBY 28 7
  DZA 28 5   MAR 30 4   TUN 33 4   NGA 18 2   ETH 19 1   COD 16 1   ZAF 28 6   KEN 20 2
  TZA 18 1   UGA 16 1   SDN 19 1   NER 15 1   MLI 15 1   TCD 16 1   AGO 16 2   MOZ 17 1
  MDG 20 1   GHA 21 2   CMR 18 2   ZMB 18 1   ZWE 18 2   NAM 22 4   BWA 24 7   SOM 16 1
  SAU 30 32  IRN 33 5   IRQ 20 6   SYR 22 1   YEM 19 1   AFG 17 0   PAK 21 1   IND 28 3
  BGD 27 3   NPL 25 1   LKA 33 4   CHN 39 13  MNG 28 6   JPN 49 34  KOR 44 33  PRK 36 1
  IDN 30 5   THA 40 7   VNM 33 4   PHL 25 4   MYS 30 12  MMR 29 1   KAZ 30 13  UZB 28 2
  AUS 38 65  NZL 38 48  PNG 22 3
`
  .trim()
  .split(/\s+/);
/** The codes, and the two values after each. */
const LOCATIONS = COUNTRIES.filter((_, i) => i % 3 === 0);
const MEDIAN_AGE = COUNTRIES.filter((_, i) => i % 3 === 1).map(Number);
const INCOME = COUNTRIES.filter((_, i) => i % 3 === 2).map(Number);

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locations: LOCATIONS,
        z: MEDIAN_AGE,
        // The second value: the height of each country's prism.
        elevation: INCOME,
        // The tallest country (the largest elevation) is 0.18 globe radii high.
        elevationscale: 0.18,
        name: 'median age',
        colorscale: 'Viridis',
        colorbar: { title: { text: 'median age (years)' } },
        marker: { line: { color: 'rgba(255, 255, 255, 0.6)', width: 0.5 } },
        hovertemplate: '%{location}<br>median age %{z}<br>income %{elevation}k $<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Median age (color) and income per person (height)' },
      geo: {
        fitbounds: false,
        // A scale under 1 leaves room around the globe for the prisms that rise past its limb.
        projection: { type: 'globe3d', rotation: { lon: -60, lat: 38 }, scale: 0.85 },
        showocean: true,
        oceancolor: '#dbe9f4',
        landcolor: '#e9e4d8',
        lakecolor: '#dbe9f4',
        showcountries: true,
        countrycolor: '#c9c2b0',
        showframe: false,
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
