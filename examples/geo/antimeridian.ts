import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The antimeridian (backlog GEO5): a map centred on 180°, where most world maps end. Russia's
 * Chukotka, the Aleutian Islands of Alaska, Fiji and New Zealand's outlying islands all lie on
 * both sides of it. The basemap keeps such countries in one piece across ±180° and the projection
 * cuts them only where this map ends, so the `choropleth` regions, the borders and the coastlines
 * meet without a seam, a sliver or a line down the 180th meridian.
 *
 * `lonaxis.range: [100, -100]` is a range across the antimeridian: its west end is greater than
 * its east end. The map on the right is the north of Fiji at `resolution: 50`: the grid line that
 * touches the tip of Vanua Levu and runs through Taveuni is the 180th meridian, and neither island
 * shows it. The route from Auckland to Honolulu crosses the line too.
 */
export const meta: ExampleMeta = {
  title: 'Map: across the antimeridian',
  description:
    'A Pacific-centred choropleth: Russia, Alaska, Fiji and New Zealand drawn whole across 180°.',
  tags: ['geo', 'choropleth', 'scattergeo', 'antimeridian', 'map'],
  size: { width: 900, height: 480 },
  testTolerance: 0.004,
};

/** Countries around the North and South Pacific, and a class for each to color it by. */
const COUNTRIES = ['RUS', 'USA', 'CAN', 'JPN', 'FJI', 'NZL', 'AUS', 'PNG', 'CHN', 'MNG'];
const CLASSES = [4, 2, 1, 3, 5, 3, 1, 2, 0, 0];

export function run(el: HTMLElement): ExampleHandle {
  const regions = {
    type: 'choropleth',
    locations: COUNTRIES,
    z: CLASSES,
    colorscale: 'Viridis',
    showscale: false,
    marker: { line: { width: 0.5 } },
  } as const;
  const chart = createChart(el, {
    data: [
      { ...regions, name: 'countries' },
      {
        type: 'scattergeo',
        mode: 'lines+markers+text',
        lon: [174.76, -157.86],
        lat: [-36.85, 21.31],
        text: ['Auckland', 'Honolulu'],
        textposition: ['bottom center', 'top center'],
        name: 'route',
        line: { width: 1.5, color: '#ffffff' },
        marker: { size: 5, color: '#ffffff' },
      },
      { ...regions, name: 'Fiji', geo: 'geo2' as const },
    ],
    layout: {
      title: { text: 'Centred on 180°' },
      showlegend: false,
      margin: { l: 10, r: 10, t: 44, b: 10 },
      geo: {
        domain: { x: [0, 0.6], y: [0, 1] },
        fitbounds: false,
        projection: { type: 'mercator', rotation: { lon: 180 } },
        lonaxis: { range: [100, -100], showgrid: true, dtick: 20 },
        lataxis: { range: [-52, 74], showgrid: true, dtick: 20 },
        showcountries: true,
      },
      geo2: {
        domain: { x: [0.64, 1], y: [0.15, 0.85] },
        fitbounds: false,
        resolution: 50,
        projection: { type: 'mercator', rotation: { lon: 180 } },
        lonaxis: { range: [178.2, -179.2], showgrid: true, dtick: 1 },
        lataxis: { range: [-17.4, -15.9], showgrid: true, dtick: 0.5 },
      },
      annotations: [
        {
          text: 'Vanua Levu and Taveuni, 1:50m, on the 180° grid line',
          x: 0.82,
          y: 0.9,
          xref: 'paper',
          yref: 'paper',
          xanchor: 'center',
          showarrow: false,
        },
      ],
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
