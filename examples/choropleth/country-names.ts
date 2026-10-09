import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Countries by name (backlog GEO4, GEO10): `locationmode: 'country names'` reads `locations` as
 * names (English short names and common alternates such as "Czech Republic", in any case), so a
 * table that has no ISO codes needs no lookup of its own. The table of names is a lazy chunk,
 * loaded the first time a figure uses this mode. Countries the data does not name show the land
 * color.
 *
 * The map is a world map cut to Europe with `lonaxis.range` and `lataxis.range`, not
 * `scope: 'europe'`: a scope has the countries of its continent only, and Natural Earth files
 * Cyprus under Asia. `resolution: 50` has the small countries (Malta, Luxembourg) the 110m data
 * leaves out.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: countries by name',
  description:
    'Members of the European Union by the year they joined, named in full, on a map cut to Europe.',
  tags: ['geo', 'choropleth', 'country names', 'resolution', 'europe', 'colorscale', 'map'],
  testTolerance: 0.004,
};

/** Year of joining the European Union (or its predecessors), by member state. */
const JOINED: readonly (readonly [number, readonly string[]])[] = [
  [1958, ['Belgium', 'France', 'Germany', 'Italy', 'Luxembourg', 'Netherlands']],
  [1973, ['Denmark', 'Ireland']],
  [1981, ['Greece']],
  [1986, ['Portugal', 'Spain']],
  [1995, ['Austria', 'Finland', 'Sweden']],
  [
    2004,
    [
      'Cyprus',
      'Czech Republic',
      'Estonia',
      'Hungary',
      'Latvia',
      'Lithuania',
      'Malta',
      'Poland',
      'Slovakia',
      'Slovenia',
    ],
  ],
  [2007, ['Bulgaria', 'Romania']],
  [2013, ['Croatia']],
];

export function run(el: HTMLElement): ExampleHandle {
  const locations = JOINED.flatMap(([, names]) => names);
  const z = JOINED.flatMap(([year, names]) => names.map(() => year));
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locationmode: 'country names',
        locations,
        z,
        name: 'joined',
        hovertemplate: '%{location}: %{z}<extra></extra>',
        marker: { line: { color: '#fff', width: 0.5 } },
        colorbar: { title: { text: 'joined' }, tickformat: 'd' },
      },
    ],
    layout: {
      title: { text: 'Members of the European Union' },
      geo: {
        resolution: 50,
        fitbounds: false,
        projection: { type: 'mercator' },
        lonaxis: { range: [-12, 36] },
        lataxis: { range: [34, 71] },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
