import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A bubble map (backlog GEO3, GEO10): `scattergeo` markers with a size and a color per point.
 * `marker.size` with `sizemode: 'area'` makes the area of a bubble follow its value, and numbers
 * in `marker.color` go through a colorscale; `marker.showscale` adds its colorbar. The map is
 * turned to the Pacific (`projection.rotation.lon`), where most of these earthquakes were.
 */
export const meta: ExampleMeta = {
  title: 'Map: bubbles with a colorbar',
  description: 'Earthquakes as bubbles, sized by energy and colored by depth.',
  tags: ['geo', 'scattergeo', 'markers', 'bubble', 'colorscale', 'colorbar', 'map'],
  testTolerance: 0.004,
};

/** Place, longitude, latitude, magnitude, depth in km: large earthquakes since 2004, rounded. */
const QUAKES: readonly (readonly [string, number, number, number, number])[] = [
  ['Sumatra 2004', 95.98, 3.3, 9.1, 30],
  ['Tōhoku 2011', 142.37, 38.3, 9.1, 29],
  ['Maule 2010', -72.9, -36.12, 8.8, 23],
  ['Nias 2005', 97.11, 2.09, 8.6, 30],
  ['Indian Ocean 2012', 93.06, 2.33, 8.6, 20],
  ['Illapel 2015', -71.67, -31.57, 8.3, 22],
  ['Sea of Okhotsk 2013', 153.22, 54.89, 8.3, 598],
  ['Kuril Islands 2006', 153.27, 46.59, 8.3, 10],
  ['Chignik 2021', -157.89, 55.36, 8.2, 35],
  ['Fiji 2018', -178.15, -18.11, 8.2, 600],
  ['Chiapas 2017', -93.9, 15.02, 8.2, 47],
  ['Iquique 2014', -70.77, -19.61, 8.2, 25],
  ['Kermadec 2021', -177.28, -29.72, 8.1, 29],
  ['Samoa 2009', -172.1, -15.49, 8.1, 18],
  ['Peru 2019', -75.27, -5.81, 8.0, 123],
  ['Sichuan 2008', 103.32, 31.0, 7.9, 19],
  ['Gorkha 2015', 84.73, 28.23, 7.8, 8],
  ['Kahramanmaraş 2023', 37.01, 37.23, 7.8, 10],
  ['Kaikōura 2016', 173.05, -42.74, 7.8, 15],
  ['Haiti 2010', -72.57, 18.44, 7.0, 13],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        lon: QUAKES.map((q) => q[1]),
        lat: QUAKES.map((q) => q[2]),
        text: QUAKES.map((q) => `${q[0]}: M ${q[3].toFixed(1)}`),
        hoverinfo: 'text',
        mode: 'markers',
        name: 'earthquakes',
        marker: {
          // Energy grows by a factor of about 32 per magnitude; the areas follow a gentler curve.
          size: QUAKES.map((q) => 10 ** (q[3] - 7)),
          sizemode: 'area',
          sizeref: 0.11,
          sizemin: 4,
          color: QUAKES.map((q) => q[4]),
          colorscale: 'Viridis',
          reversescale: true,
          showscale: true,
          opacity: 0.8,
          line: { color: '#fff', width: 0.5 },
          colorbar: { title: { text: 'depth, km' } },
        },
      },
    ],
    layout: {
      title: { text: 'Large earthquakes, 2004 to 2023' },
      geo: {
        fitbounds: false,
        projection: { type: 'natural earth', rotation: { lon: 150 } },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
