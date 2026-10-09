import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A choropleth of your own regions (backlog GEO4, GEO5): `geojson` gives the features and
 * `featureidkey` says where each has the id that `locations` name. `fitbounds: 'geojson'` fits the
 * view to the whole file, and `geo.visible: false` hides the base map.
 *
 * The districts are made up: one has a hole with another district in it, and one is a
 * multipolygon with an island. Their rings are wound the way `d3-geo` wants (outer rings
 * clockwise). Rings wound the RFC 7946 way are rewound for you, with one warning in the console.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: GeoJSON',
  description: 'Regions from an inline GeoJSON, matched to locations by a property.',
  tags: ['geo', 'choropleth', 'geojson', 'featureidkey', 'colorscale', 'map'],
  testTolerance: 0.004,
};

const DISTRICTS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { district: 'N', name: 'Northmoor' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [10, 47],
            [10, 48],
            [13, 48.3],
            [16, 48],
            [16, 47],
            [13, 46.7],
            [10, 47],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { district: 'W', name: 'Westvale' },
      geometry: {
        type: 'Polygon',
        // The second ring is a hole: the city has a district of its own.
        coordinates: [
          [
            [10, 44],
            [10, 47],
            [13, 46.7],
            [13, 44],
            [10, 44],
          ],
          [
            [11, 45],
            [12, 45],
            [12, 46],
            [11, 46],
            [11, 45],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { district: 'C', name: 'Lake City' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [11, 45],
            [11, 46],
            [12, 46],
            [12, 45],
            [11, 45],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { district: 'E', name: 'Eastmarch' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [13, 44],
              [13, 46.7],
              [16, 47],
              [16, 44],
              [13, 44],
            ],
          ],
          [
            [
              [16.6, 45],
              [16.6, 45.8],
              [17.3, 45.8],
              [17.3, 45],
              [16.6, 45],
            ],
          ],
        ],
      },
    },
  ],
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        geojson: DISTRICTS,
        featureidkey: 'properties.district',
        locations: ['N', 'W', 'C', 'E'],
        z: [12, 30, 55, 21],
        name: 'turnout',
        hovertemplate: '%{properties.name}: %{z}%<extra></extra>',
        colorbar: { title: { text: '%' } },
        marker: { line: { width: 1.5 } },
      },
    ],
    layout: {
      title: { text: 'Turnout by district' },
      geo: { fitbounds: 'geojson', visible: false, projection: { type: 'mercator' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
