import { createChart, register, toImage, type Figure } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import { de } from '@mk7s/holochart-locales';
import type { GeoSubplot } from '@mk7s/holochart/geo';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Geo interaction playground (backlog GEO2, GEO6): hover and click on `scattergeo` markers, the
 * drag of each kind of map (a world map turns in longitude and moves up and down, a globe turns
 * in longitude and latitude, a scoped map pans), wheel and pinch zoom, double-click reset,
 * `fitbounds`, box / lasso selection, `staticPlot`, two subplots, a 50m basemap and a lazily
 * loaded projection; keyboard stops and view keys of `scattergeo` and `choropleth`; image export
 * and WebGL context loss. Every chart event is logged to `window.__interaction.events`, which
 * tests/interaction/geo.spec.ts and keyboard-geo.spec.ts read.
 *
 * One map per page load, chosen by the query parameter `geo` (default `world`), so that every
 * scenario starts from a fresh chart with one full-size subplot:
 *
 * | `geo`        | Map                                                             | Drag (see `interact.ts`) |
 * | ------------ | --------------------------------------------------------------- | ------------------------ |
 * | `world`      | natural earth, `fitbounds: false`                               | unclipped                |
 * | `globe`      | orthographic, `fitbounds: false`                                | clipped                  |
 * | `usa`        | `scope: 'usa'` (Albers USA), `fitbounds: false`                 | scoped                   |
 * | `fit`        | natural earth, `fitbounds` left to its default                  | unclipped                |
 * | `hires`      | orthographic, `resolution: 50`, `fitbounds: false`              | clipped                  |
 * | `two`        | `geo` (natural earth, left) and `geo2` (orthographic)           | unclipped and clipped    |
 * | `robinson`   | Robinson, a projection whose code is a lazy chunk               | unclipped                |
 * | `choro`      | a choropleth by ISO-3 `locations` and two cities, natural earth | unclipped                |
 * | `choroglobe` | the same on an orthographic globe                               | clipped                  |
 * | `globe3d`    | the 3D globe (`'globe3d'`, GEO8), `fitbounds: false`            | clipped                  |
 * | `hires3d`    | the 3D globe at `resolution: 50`                                | clipped                  |
 * | `choroglobe3d` | the choropleth and the cities on the 3D globe                 | clipped                  |
 * | `names`      | the same by country names, on Robinson at `resolution: 50`      | unclipped                |
 * | `blank`      | no map: a cartesian chart, for a page whose first map is an export | —                     |
 *
 * `static=1` sets `config.staticPlot`; `scroll=false` (or `scroll=cartesian`, any flag list
 * without `geo`) sets `config.scrollZoom`; `shared=1` draws through the shared renderer; `table=1`
 * shows the data tables (`config.a11y.dataTable: 'visible'`); `locale=de` sets `config.locale`.
 *
 * The geometry is fixed: 640×400 px, 20 px margins, so the plot area is the 600×360 px rect at
 * (20, 20). Tests do not compute projections: `window.__interaction.geo` maps a longitude and
 * latitude to page px in the current view (`toPage`), a page point back (`invert`), and reports
 * the view (`view`). Land, ocean and marker colors are fixed for pixel checks.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: geo',
  description:
    'Hover, click, pan, rotate, wheel and pinch zoom, reset, fitbounds and selection on geo subplots; events are logged to window.__interaction.',
  tags: ['dev', 'geo', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** What `window.__interaction.geo` gives the tests. */
export interface GeoHook {
  /** The map of this page load (the `geo` query parameter). */
  readonly variant: string;
  /**
   * Where a longitude and latitude are drawn in the current view of subplot `id`, in page px.
   * `hidden` when the projection does not draw the point (the far side of a globe): `x` and `y`
   * are then where the maths alone puts it. `null` without a view or a finite answer.
   */
  toPage(lon: number, lat: number, id?: string): { x: number; y: number; hidden: boolean } | null;
  /** The longitude and latitude drawn at a page point; `null` off the map. */
  invert(x: number, y: number, id?: string): { lon: number; lat: number } | null;
  /** The current view of subplot `id`; `null` while it has none. */
  view(id?: string): {
    mode: string;
    version: number;
    rotation: { lon: number; lat: number };
    center: { lon: number; lat: number } | null;
    scale: number;
    /** The rect the map draws in, page px. */
    rect: { x: number; y: number; width: number; height: number };
    /** The subplot is a 3D globe (`projection.type: 'globe3d'`). */
    globe: boolean;
    /** The kind of the viewport the subplot draws in; `null` when the chart has none for it. */
    viewport: '2d' | '3d' | null;
  } | null;
  /** The figure of variant `name` (what the page draws for `geo=name`). */
  figure(name: string): Figure;
  /**
   * `toImage` of the figure of variant `name`, drawn offscreen at the page's size: a PNG data
   * URL. On the `blank` page it is the first map of the page, so nothing it needs is loaded yet.
   */
  toImage(name: string): Promise<string>;
}

export interface GeoInteractionHook extends InteractionHook {
  geo: GeoHook;
}

const EVENTS = [
  'hover',
  'unhover',
  'click',
  'doubleclick',
  'relayout',
  'relayouting',
  'selecting',
  'selected',
  'deselect',
] as const;

/** Keep what tests assert on (points without their trace objects). */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    return {
      points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        lon: pt['lon'],
        lat: pt['lat'],
        location: pt['location'],
        text: pt['text'],
      })),
    };
  }
  return JSON.parse(JSON.stringify(p)) as unknown;
}

const RED = '#ea2a37';
const BLUE = '#5e74d5';
const LAND = '#d9c9a3';
const OCEAN = '#cfe3f2';

/** The layers every variant draws: flat colors under the markers, and no lines but the coast. */
const BASE = {
  showland: true,
  landcolor: LAND,
  showocean: true,
  oceancolor: OCEAN,
  showlakes: false,
  showcoastlines: true,
  coastlinecolor: '#7a6f57',
  coastlinewidth: 1,
  showframe: false,
};

/** The ends of the choropleths' colorscale: the color of the lowest and of the highest region. */
const LOW = '#1b7837';
const HIGH = '#762a83';

type Points = readonly (readonly [lon: number, lat: number, text: string])[];

function trace(name: string, color: string, points: Points, geo = 'geo'): Record<string, unknown> {
  return {
    type: 'scattergeo',
    name,
    geo,
    mode: 'markers',
    lon: points.map((p) => p[0]),
    lat: points.map((p) => p[1]),
    text: points.map((p) => p[2]),
    marker: { size: 12, color, opacity: 1 },
  };
}

/** Points of a world map. On a globe turned to (0°, 0°), `a3` and `b1` are on the far side. */
const WORLD_A: Points = [
  [10, 10, 'a0'],
  [60, 30, 'a1'],
  [-60, 40, 'a2'],
  [120, -30, 'a3'],
];
const WORLD_B: Points = [
  [-60, -15, 'b0'],
  [150, 50, 'b1'],
];

/**
 * A choropleth of five countries, in an order that is neither alphabetical nor west to east:
 * France is the lowest (`LOW`), Australia the highest (`HIGH`). On a globe turned to (0°, 0°) only
 * Brazil and France are on the near side.
 */
function regions(locations: readonly string[], locationmode?: string): Record<string, unknown> {
  return {
    type: 'choropleth',
    name: 'Index',
    locations,
    ...(locationmode ? { locationmode } : {}),
    z: [20, 10, 50, 30, 40],
    colorscale: [
      [0, LOW],
      [1, HIGH],
    ],
    showscale: false,
    marker: { line: { color: '#ffffff', width: 1 } },
  };
}
const ISO3 = ['BRA', 'FRA', 'AUS', 'USA', 'CHN'];
const NAMES = ['Brazil', 'France', 'Australia', 'United States', 'China'];
const CITIES: Points = [
  [-0.1, 51.5, 'London'],
  [139.7, 35.7, 'Tokyo'],
];

interface Variant {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

const world = (geo: Record<string, unknown>): Variant => ({
  data: [trace('A', RED, WORLD_A), trace('B', BLUE, WORLD_B)],
  layout: { geo: { ...BASE, ...geo } },
});

const VARIANTS: Record<string, () => Variant> = {
  world: () => world({ fitbounds: false, projection: { type: 'natural earth' } }),
  globe: () => world({ fitbounds: false, projection: { type: 'orthographic' } }),
  hires: () => world({ fitbounds: false, resolution: 50, projection: { type: 'orthographic' } }),
  // Holochart's 3D globe: the view of `globe`, drawn as a lit sphere in a 3D viewport (ADR-028).
  globe3d: () => world({ fitbounds: false, projection: { type: 'globe3d' } }),
  hires3d: () => world({ fitbounds: false, resolution: 50, projection: { type: 'globe3d' } }),
  usa: () => ({
    data: [
      trace('A', RED, [
        [-100, 40, 'a0'],
        [-120, 37, 'a1'],
        [-80, 35, 'a2'],
      ]),
      trace('B', BLUE, [
        [-90, 45, 'b0'],
        [-105, 32, 'b1'],
      ]),
    ],
    layout: { geo: { ...BASE, scope: 'usa', fitbounds: false } },
  }),
  // `fitbounds` at its default: the first view is fitted to these points.
  fit: () => ({
    data: [
      trace('A', RED, [
        [0, 45, 'a0'],
        [20, 50, 'a1'],
        [10, 60, 'a2'],
      ]),
      trace('B', BLUE, [
        [30, 40, 'b0'],
        [-5, 55, 'b1'],
      ]),
    ],
    layout: { geo: { ...BASE, projection: { type: 'natural earth' } } },
  }),
  robinson: () => world({ fitbounds: false, projection: { type: 'robinson' } }),
  choro: () => ({
    data: [regions(ISO3), trace('Cities', RED, CITIES)],
    layout: { geo: { ...BASE, fitbounds: false, projection: { type: 'natural earth' } } },
  }),
  choroglobe: () => ({
    data: [regions(ISO3), trace('Cities', RED, CITIES)],
    layout: { geo: { ...BASE, fitbounds: false, projection: { type: 'orthographic' } } },
  }),
  choroglobe3d: () => ({
    data: [regions(ISO3), trace('Cities', RED, CITIES)],
    layout: { geo: { ...BASE, fitbounds: false, projection: { type: 'globe3d' } } },
  }),
  // Everything a map can load lazily: the 50m basemap, the code of the projection, and the
  // country-name table the locations are matched with.
  names: () => ({
    data: [regions(NAMES, 'country names'), trace('Cities', RED, CITIES)],
    layout: {
      geo: { ...BASE, fitbounds: false, resolution: 50, projection: { type: 'robinson' } },
    },
  }),
  blank: () => ({
    data: [{ type: 'scatter', mode: 'markers', x: [0, 1], y: [0, 1] }],
    layout: {},
  }),
  two: () => ({
    data: [
      trace('A', RED, WORLD_A),
      trace(
        'B',
        BLUE,
        [
          [-40, -15, 'b0'],
          [30, 30, 'b1'],
        ],
        'geo2',
      ),
    ],
    layout: {
      geo: {
        ...BASE,
        fitbounds: false,
        projection: { type: 'natural earth' },
        domain: { x: [0, 0.48], y: [0, 1] },
      },
      geo2: {
        ...BASE,
        fitbounds: false,
        projection: { type: 'orthographic' },
        domain: { x: [0.52, 1], y: [0, 1] },
      },
    },
  }),
};

export function run(el: HTMLElement): ExampleHandle {
  const query = new URLSearchParams(location.search);
  const name = query.get('geo') ?? 'world';
  const scroll = query.get('scroll');
  const locale = query.get('locale');
  if (locale === 'de') register(de);
  const config: Record<string, unknown> = {
    ...(query.get('static') === '1' ? { staticPlot: true } : {}),
    ...(scroll === null ? {} : { scrollZoom: scroll === 'false' ? false : scroll }),
    ...(query.get('shared') === '1' ? { sharedRenderer: true } : {}),
    ...(query.get('table') === '1' ? { a11y: { dataTable: 'visible' } } : {}),
    ...(locale === null ? {} : { locale }),
  };
  const figureOf = (variantName: string): Figure => {
    const variant = (VARIANTS[variantName] ?? VARIANTS['world']!)();
    return {
      data: variant.data,
      layout: {
        margin: { l: 20, r: 20, t: 20, b: 20 },
        showlegend: false,
        dragmode: 'pan',
        ...variant.layout,
      },
      config,
    } as Figure;
  };
  const chart = createChart(el, figureOf(name));

  /** The laid-out subplot `id`, from the calc of a trace drawn on it. */
  const subplotOf = (id: string): GeoSubplot | undefined => {
    for (let i = 0; i < chart.fullData.length; i++) {
      if ((chart.fullData[i] as { geo?: unknown }).geo !== id) continue;
      const calc = chart.getCalcdata(i) as { subplot?: GeoSubplot } | undefined;
      if (calc?.subplot) return calc.subplot;
    }
    return undefined;
  };
  const origin = (): { left: number; top: number } =>
    chart.three.root.canvas.getBoundingClientRect();
  const geo: GeoHook = {
    variant: name,
    figure: figureOf,
    toImage: (variantName) =>
      toImage(figureOf(variantName), { width: meta.size!.width, height: meta.size!.height }),
    toPage(lon, lat, id = 'geo') {
      const sp = subplotOf(id);
      const view = sp?.view;
      if (!sp || !view?.valid) return null;
      const p = view.projectAt(view.state, lon, lat);
      if (!p) return null;
      const o = origin();
      return {
        x: o.left + sp.rect.x + p[0],
        y: o.top + sp.rect.y + sp.rect.height - p[1],
        hidden: view.isLonLatOverEdges(lon, lat),
      };
    },
    invert(x, y, id = 'geo') {
      const sp = subplotOf(id);
      const view = sp?.view;
      if (!sp || !view?.valid) return null;
      const o = origin();
      const [sx, sy] = sp.toSubplot(x - o.left, y - o.top);
      const lonlat = view.invert(sx, sy);
      return lonlat && { lon: lonlat[0], lat: lonlat[1] };
    },
    view(id = 'geo') {
      const sp = subplotOf(id);
      const view = sp?.view;
      if (!sp || !view?.valid) return null;
      const now = view.toLayout();
      const o = origin();
      const clip = sp.clipRect;
      return {
        mode: view.mode,
        version: view.version,
        rotation: now.rotation,
        center: now.center,
        scale: now.scale,
        rect: { x: o.left + clip.x, y: o.top + clip.y, width: clip.width, height: clip.height },
        globe: sp.globe,
        // The runtime names a viewport after its key: a globe's own 3D viewport, else the 2D one.
        viewport:
          chart.three.root.viewports.find(
            (vp) => vp.name === `subplot-${sp.globe ? sp.viewportKey : sp.id}`,
          )?.kind ?? null,
      };
    },
  };

  const hook: GeoInteractionHook = { chart, events: [], geo };
  for (const event of EVENTS) {
    chart.on(event, (payload: unknown) => {
      hook.events.push({ name: event, payload: summarize(payload) });
    });
  }
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
