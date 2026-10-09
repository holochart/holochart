import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Contact sheet of every projection of the `geo` subplot (backlog GEO5): the tool the geometry
 * audit looks at. Each cell is a world map in one `projection.type` with the ocean (the sphere's
 * fill), land, coastlines, countries, the graticule and the frame, two `scattergeo` lines that
 * cross the antimeridian (Tokyo to Los Angeles, Sydney to Santiago) and markers at 85°N and 85°S.
 * What to look for: a fill that leaks across the map, missing land, a stray line along the
 * antimeridian or the clip edge, a frame that is not the outline of the ocean, land outside it.
 *
 * Query parameters:
 *
 * | Parameter | Meaning                                                             | Default |
 * | --------- | ------------------------------------------------------------------- | ------- |
 * | `page`    | Which page of the alphabetical list of the 84 names, from 0         | `0`     |
 * | `n`       | Projections per page                                                | `6`     |
 * | `cols`    | Columns of the grid                                                 | `3`     |
 * | `types`   | Comma-separated names instead of a page (`types=mercator,robinson`) |         |
 * | `rot`     | `lon,lat,roll` of `projection.rotation` for every cell              | `0,0,0` |
 * | `res`     | `resolution`, 110 or 50                                             | `110`   |
 * | `scope`   | `scope` for every cell (the projection is then the cell's, not the scope's) | `world` |
 * | `tilt`, `distance` | of the `satellite` projection                              |         |
 *
 * Not a visual test: 84 maps are 14 pages, and `examples/geo/*` cover the cases worth a baseline.
 */
export const meta: ExampleMeta = {
  title: 'Geo: every projection',
  description:
    'A contact sheet of world maps, one per projection type, a page at a time (see the query parameters).',
  tags: ['dev', 'geo', 'no-visual-test'],
  size: { width: 1200, height: 800 },
};

/** Plotly's `projection.type` names (plotly.js `src/plots/geo/constants.js`), sorted. */
const PROJECTION_NAMES: readonly string[] = [
  'airy',
  'aitoff',
  'albers',
  'albers usa',
  'august',
  'azimuthal equal area',
  'azimuthal equidistant',
  'baker',
  'bertin1953',
  'boggs',
  'bonne',
  'bottomley',
  'bromley',
  'collignon',
  'conic conformal',
  'conic equal area',
  'conic equidistant',
  'craig',
  'craster',
  'cylindrical equal area',
  'cylindrical stereographic',
  'eckert1',
  'eckert2',
  'eckert3',
  'eckert4',
  'eckert5',
  'eckert6',
  'eisenlohr',
  'equal earth',
  'equirectangular',
  'fahey',
  'foucaut',
  'foucaut sinusoidal',
  'ginzburg4',
  'ginzburg5',
  'ginzburg6',
  'ginzburg8',
  'ginzburg9',
  'gnomonic',
  'gringorten',
  'gringorten quincuncial',
  'guyou',
  'hammer',
  'hill',
  'homolosine',
  'hufnagel',
  'hyperelliptical',
  'kavrayskiy7',
  'lagrange',
  'larrivee',
  'laskowski',
  'loximuthal',
  'mercator',
  'miller',
  'mollweide',
  'mt flat polar parabolic',
  'mt flat polar quartic',
  'mt flat polar sinusoidal',
  'natural earth',
  'natural earth1',
  'natural earth2',
  'nell hammer',
  'nicolosi',
  'orthographic',
  'patterson',
  'peirce quincuncial',
  'polyconic',
  'rectangular polyconic',
  'robinson',
  'satellite',
  'sinu mollweide',
  'sinusoidal',
  'stereographic',
  'times',
  'transverse mercator',
  'van der grinten',
  'van der grinten2',
  'van der grinten3',
  'van der grinten4',
  'wagner4',
  'wagner6',
  'wiechel',
  'winkel tripel',
  'winkel3',
];

/** Two routes over the Pacific, each crossing ±180°; a gap (NaN) between them. */
const ROUTE_LON = [139.69, -118.41, NaN, 151.21, -70.67];
const ROUTE_LAT = [35.69, 33.94, NaN, -33.87, -33.45];
const POLAR_LON = [0, 120, -120, 0, 120, -120];
const POLAR_LAT = [85, 85, 85, -85, -85, -85];

function numbers(text: string | null, count: number): number[] {
  const out = (text ?? '').split(',').map(Number);
  return Array.from({ length: count }, (_, i) => (Number.isFinite(out[i]) ? out[i]! : 0));
}

export function run(el: HTMLElement): ExampleHandle {
  const query = new URLSearchParams(location.search);
  const perPage = Math.max(1, Number(query.get('n')) || 6);
  const cols = Math.max(1, Number(query.get('cols')) || 3);
  const page = Math.max(0, Number(query.get('page')) || 0);
  const listed = query.get('types');
  const types = listed
    ? listed.split(',').map((t) => t.trim())
    : PROJECTION_NAMES.slice(page * perPage, (page + 1) * perPage);
  const [lon, lat, roll] = numbers(query.get('rot'), 3) as [number, number, number];
  const resolution = query.get('res') === '50' ? 50 : 110;
  const scope = query.get('scope');
  const tilt = query.get('tilt');
  const distance = query.get('distance');
  const rows = Math.max(1, Math.ceil(types.length / cols));

  const data: Record<string, unknown>[] = [];
  const layout: Record<string, unknown> = {
    margin: { l: 8, r: 8, t: 8, b: 8 },
    showlegend: false,
    paper_bgcolor: '#ffffff',
  };
  const annotations: Record<string, unknown>[] = [];
  const gap = 0.02;
  const label = 0.05;
  types.forEach((type, i) => {
    const id = i === 0 ? 'geo' : `geo${i + 1}`;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = col / cols + gap / 2;
    const x1 = (col + 1) / cols - gap / 2;
    const y1 = 1 - row / rows - label;
    const y0 = 1 - (row + 1) / rows + gap / 2;
    layout[id] = {
      domain: { x: [x0, x1], y: [y0, y1] },
      fitbounds: false,
      resolution,
      ...(scope ? { scope } : {}),
      projection: {
        type,
        rotation: { lon, lat, roll },
        ...(tilt !== null ? { tilt: Number(tilt) } : {}),
        ...(distance !== null ? { distance: Number(distance) } : {}),
      },
      bgcolor: '#f3f3f3',
      showocean: true,
      oceancolor: '#cfe3f2',
      showland: true,
      landcolor: '#e3d3a8',
      // The default template shows lakes in the page's background colour.
      showlakes: false,
      showcoastlines: true,
      coastlinecolor: '#6b5d3c',
      coastlinewidth: 0.8,
      showcountries: true,
      countrycolor: '#a3956f',
      countrywidth: 0.5,
      showframe: true,
      framecolor: '#d0312d',
      framewidth: 1.5,
      lonaxis: { showgrid: true, gridcolor: '#8fa6b8', gridwidth: 0.5 },
      lataxis: { showgrid: true, gridcolor: '#8fa6b8', gridwidth: 0.5 },
    };
    data.push(
      {
        type: 'scattergeo',
        geo: id,
        mode: 'lines',
        lon: ROUTE_LON,
        lat: ROUTE_LAT,
        line: { color: '#7b2cbf', width: 2 },
        hoverinfo: 'skip',
      },
      {
        type: 'scattergeo',
        geo: id,
        mode: 'markers',
        lon: POLAR_LON,
        lat: POLAR_LAT,
        marker: { color: '#111111', size: 5 },
        hoverinfo: 'skip',
      },
    );
    annotations.push({
      text: type,
      x: (x0 + x1) / 2,
      y: 1 - row / rows - label / 2,
      xref: 'paper',
      yref: 'paper',
      xanchor: 'center',
      yanchor: 'middle',
      showarrow: false,
      font: { size: 13 },
    });
  });
  layout['annotations'] = annotations;

  const chart = createChart(el, { data, layout });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
