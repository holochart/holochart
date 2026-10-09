import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A choropleth (backlog GEO4): countries named by ISO-3 code in `locations`, each filled with the
 * color of its `z` value, with a colorbar. Countries the data does not name show the land color.
 * Maps are not in the full bundle: `import '@mk7s/holochart/geo'` adds them.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: world',
  description: 'Countries colored by a value, named by ISO-3 code, with a colorbar.',
  tags: ['geo', 'choropleth', 'colorscale', 'colorbar', 'map'],
  testTolerance: 0.004,
};

/** Median age in years by ISO-3 code: approximate, rounded values for illustration. */
const MEDIAN_AGE = `
  USA 38  CAN 41  MEX 30  GTM 23  CUB 42  BRA 34  ARG 32  CHL 36  COL 32  PER 30  VEN 30  BOL 25
  ECU 29  PRY 27  URY 36  GBR 40  IRL 39  FRA 42  DEU 46  ITA 48  ESP 45  PRT 46  NLD 42  BEL 42
  CHE 43  AUT 44  POL 42  CZE 43  ROU 43  GRC 46  UKR 41  BLR 41  SWE 41  NOR 40  FIN 43  DNK 42
  RUS 40  TUR 33  EGY 24  LBY 28  DZA 28  MAR 30  TUN 33  NGA 18  ETH 19  COD 16  ZAF 28  KEN 20
  TZA 18  UGA 16  SDN 19  NER 15  MLI 15  TCD 16  AGO 16  MOZ 17  MDG 20  GHA 21  CMR 18  ZMB 18
  ZWE 18  NAM 22  BWA 24  SOM 16  SAU 30  IRN 33  IRQ 20  SYR 22  YEM 19  AFG 17  PAK 21  IND 28
  BGD 27  NPL 25  LKA 33  CHN 39  MNG 28  JPN 49  KOR 44  PRK 36  IDN 30  THA 40  VNM 33  PHL 25
  MYS 30  MMR 29  KAZ 30  UZB 28  AUS 38  NZL 38  PNG 22
`
  .trim()
  .split(/\s+/);
/** The codes, and the value after each. */
const LOCATIONS = MEDIAN_AGE.filter((_, i) => i % 2 === 0);
const VALUES = MEDIAN_AGE.filter((_, i) => i % 2 === 1).map(Number);

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locations: LOCATIONS,
        z: VALUES,
        name: 'median age',
        colorbar: { title: { text: 'years' } },
      },
    ],
    layout: {
      title: { text: 'Median age' },
      geo: { fitbounds: false, projection: { type: 'natural earth' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
