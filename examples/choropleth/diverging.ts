import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A diverging choropleth (backlog GEO4, GEO10): values on both sides of a meaningful middle get a
 * two-hued colorscale, and `zmid` puts the middle of the scale on that value whatever the range
 * of the data is. Here the middle is zero: with `RdBu` reversed, countries whose population
 * shrank are red, those that grew are blue, and the colorbar is symmetric about 0.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: diverging scale',
  description: 'Population change by country on a diverging colorscale centered on zero.',
  tags: ['geo', 'choropleth', 'colorscale', 'diverging', 'zmid', 'colorbar', 'map'],
  testTolerance: 0.004,
};

/** Population change 2010 to 2020 in percent by ISO-3 code: approximate, rounded, for illustration. */
const CHANGE = `
  USA 7   CAN 11  MEX 12  GTM 19  CUB 0   BRA 8   ARG 10  CHL 12  COL 12  PER 12  VEN -1  BOL 16
  ECU 16  PRY 14  URY 3   GBR 7   IRL 9   FRA 4   DEU 2   ITA -1  ESP 1   PRT -3  NLD 5   BEL 6
  CHE 10  AUT 6   POL -1  CZE 2   ROU -5  GRC -4  UKR -4  BLR -1  SWE 10  NOR 10  FIN 3   DNK 5
  HUN -2  BGR -7  SRB -5  HRV -6  LTU -10 LVA -10 EST 0   RUS 1   TUR 15  EGY 22  LBY 9   DZA 21
  MAR 13  TUN 11  NGA 29  ETH 30  COD 38  ZAF 16  KEN 26  TZA 34  UGA 37  SDN 27  NER 46  MLI 35
  TCD 38  AGO 40  MOZ 33  MDG 30  GHA 25  CMR 30  ZMB 35  ZWE 17  NAM 20  BWA 20  SOM 33  SAU 20
  IRN 14  IRQ 32  SYR -8  YEM 28  AFG 35  PAK 23  IND 12  BGD 12  NPL 8   LKA 6   CHN 5   MNG 20
  JPN -2  KOR 4   PRK 5   IDN 12  THA 4   VNM 10  PHL 17  MYS 15  MMR 7   KAZ 15  UZB 17  AUS 16
  NZL 16  PNG 24
`
  .trim()
  .split(/\s+/);
/** The codes, and the value after each. */
const LOCATIONS = CHANGE.filter((_, i) => i % 2 === 0);
const VALUES = CHANGE.filter((_, i) => i % 2 === 1).map(Number);

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locations: LOCATIONS,
        z: VALUES,
        name: 'population change',
        colorscale: 'RdBu',
        reversescale: true,
        // The middle color at 0; the domain is then symmetric: [-46, 46].
        zmid: 0,
        hovertemplate: '%{location}: %{z:+d} %<extra></extra>',
        marker: { line: { color: '#fff', width: 0.5 } },
        colorbar: { title: { text: '%' }, ticksuffix: ' %' },
      },
    ],
    layout: {
      title: { text: 'Population change, 2010 to 2020' },
      geo: {
        fitbounds: false,
        projection: { type: 'equal earth' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
