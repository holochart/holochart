import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Selected regions (backlog GEO4, GEO6, GEO10): `selectedpoints` lists the selected locations by
 * their index in `locations`, and `selected.marker.opacity` / `unselected.marker.opacity` say how
 * the two groups are drawn while a selection is active (by default the unselected regions fade to
 * a fifth of their opacity). With `dragmode: 'select'` or `'lasso'` a drag selects the regions
 * whose label point is inside the box or the lasso; a double-click clears the selection.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: selected regions',
  description: 'US states with a selection: the selected states keep their color, the rest fade.',
  tags: ['geo', 'choropleth', 'selection', 'selectedpoints', 'usa', 'map'],
  testTolerance: 0.004,
};

/** Seats in the US House of Representatives by state, after the 2020 census. */
const SEATS = `
  CA 52  TX 38  FL 28  NY 26  PA 17  IL 17  OH 15  GA 14  NC 14  MI 13  NJ 12  VA 11  WA 10  AZ 9
  MA 9   TN 9   IN 9   MD 8   MO 8   WI 8   CO 8   MN 8   SC 7   AL 7   LA 6   KY 6   OR 6   OK 5
  CT 5   UT 4   IA 4   NV 4   AR 4   MS 4   KS 4   NM 3   NE 3   ID 2   WV 2   HI 2   NH 2   ME 2
  RI 2   MT 2   DE 1   SD 1   ND 1   AK 1   VT 1   WY 1
`
  .trim()
  .split(/\s+/);
/** The codes, and the value after each. */
const LOCATIONS = SEATS.filter((_, i) => i % 2 === 0);
const VALUES = SEATS.filter((_, i) => i % 2 === 1).map(Number);

/** The states of the Pacific and Mountain time zones, more or less. */
const WEST = ['WA', 'OR', 'CA', 'NV', 'ID', 'MT', 'WY', 'UT', 'CO', 'AZ', 'NM', 'AK', 'HI'];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locationmode: 'USA-states',
        locations: LOCATIONS,
        z: VALUES,
        name: 'seats',
        selectedpoints: WEST.map((code) => LOCATIONS.indexOf(code)),
        selected: { marker: { opacity: 1 } },
        unselected: { marker: { opacity: 0.25 } },
        hovertemplate: '%{location}: %{z} seats<extra></extra>',
        marker: { line: { color: '#fff', width: 0.75 } },
        colorbar: { title: { text: 'seats' } },
      },
    ],
    layout: {
      title: { text: 'House seats: the West selected' },
      dragmode: 'select',
      geo: { scope: 'usa', fitbounds: false },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
