import { createChart, toImage, type Figure } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { GeoSubplot } from '@mk7s/holochart/geo';
import { Matrix4, Vector3 } from 'three';
import type { InteractionHook } from './interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D globe interaction playground (backlog GEO8, ADR-028): `choropleth` regions as a mesh on the
 * sphere and as prisms, hovered and clicked through GPU picking, and `scattergeo` lines as arcs
 * above the surface. Every chart event is logged to `window.__interaction.events`, which
 * tests/interaction/globe.spec.ts reads.
 *
 * One figure per page load, chosen by the query parameter `globe` (default `regions`):
 *
 * | `globe`   | Figure                                                                          |
 * | --------- | ------------------------------------------------------------------------------- |
 * | `regions` | a choropleth of square regions (a `geojson` of its own), three of them raised   |
 * | `flat`    | the same on the `'orthographic'` projection                                     |
 * | `arcs`    | two `scattergeo` routes with markers at their ends: one in front, one behind    |
 * | `both`    | a `scatter3d` scene on the left and the `regions` globe on the right            |
 *
 * The regions of the choropleth, on a globe turned to (0°, 0°), are squares in longitude and
 * latitude whose places are chosen for the tests:
 *
 * | Location | Longitude  | Latitude | z  | elevation | What it is for                              |
 * | -------- | ---------- | -------- | -- | --------- | ------------------------------------------- |
 * | `MID`    | −10…10     | −10…10   | 10 | 0         | flat, in the middle                         |
 * | `TOWER`  | 30…40      | −5…5     | 30 | 4         | a prism half a radius high                  |
 * | `BEHIND` | 45…70      | −20…20   | 20 | 0         | flat; the tower stands in front of its west |
 * | `WEST`   | −60…−40    | 10…30    | 50 | 1         | a low prism                                 |
 * | `FAR`    | 170…−170   | 30…50    | 40 | 0         | flat, behind the globe, across ±180°        |
 * | `FARTOP` | 140…150    | 20…30    | 60 | 2         | a prism behind the globe                    |
 *
 * `elevationscale` is 0.5, so the tower's cap is at 1.5 radii.
 *
 * The geometry is fixed: 640×400 px, 20 px margins, so the plot area is the 600×360 px rect at
 * (20, 20) and the globe's radius is 180 px. Tests do no projection maths:
 * `window.__interaction.globe` maps a longitude, a latitude and a height above the surface to
 * page px in the current view (`toPage`), gives the highest point of an arc (`arcTop`) and
 * reports the view (`view`). Colors are fixed for pixel checks; the globe's light dims them by
 * up to 0.3, so pixel checks compare hues, not exact colors.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: 3D globe',
  description:
    'Hover and click on choropleth regions and prisms of a 3D globe through GPU picking, and scattergeo arcs above it; events are logged to window.__interaction.',
  tags: ['dev', 'geo', 'globe3d', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

/** A point of the current view in page px. */
export interface GlobePagePoint {
  x: number;
  y: number;
  /** The globe's body is in front of the point. */
  hidden: boolean;
}

/** What `window.__interaction.globe` gives the tests. */
export interface GlobeHook {
  /** The figure of this page load (the `globe` query parameter). */
  readonly variant: string;
  /**
   * Where the point `height` globe radii above a longitude and latitude is drawn in the current
   * view of subplot `id`, in page px. `null` without a view.
   */
  toPage(lon: number, lat: number, height?: number, id?: string): GlobePagePoint | null;
  /**
   * The highest point of the arc between two points of a `scattergeo` line with `line.lift`
   * `lift`: the middle of their great circle, `lift` × its length in radians above the surface.
   */
  arcTop(
    from: readonly [number, number],
    to: readonly [number, number],
    lift: number,
    id?: string,
  ): GlobePagePoint | null;
  /** The current view of subplot `id`; `null` while it has none. */
  view(id?: string): {
    rotation: { lon: number; lat: number };
    scale: number;
    /** The globe's radius in px. */
    radius: number;
    /** The subplot is a 3D globe (`projection.type: 'globe3d'`). */
    globe: boolean;
    /** The kinds of the subplot's viewports that the chart has, bottom to top. */
    viewports: string[];
  } | null;
  /** The figure of variant `name` (what the page draws for `globe=name`). */
  figure(name: string): Figure;
  /** `toImage` of the figure of variant `name`, drawn offscreen at the page's size: a PNG data URL. */
  toImage(name: string): Promise<string>;
}

export interface GlobeInteractionHook extends InteractionHook {
  globe: GlobeHook;
}

const EVENTS = ['hover', 'unhover', 'click', 'relayout', 'selected', 'deselect'] as const;

/** Keep what tests assert on (points without their trace objects). */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    return {
      points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        location: pt['location'],
        z: pt['z'],
        elevation: pt['elevation'],
        lon: pt['lon'],
        lat: pt['lat'],
        text: pt['text'],
      })),
    };
  }
  return JSON.parse(JSON.stringify(p)) as unknown;
}

const LAND = '#d9c9a3';
const OCEAN = '#cfe3f2';
/** The ends of the choropleth's colorscale: green hues only, for pixel checks. */
const LOW = '#b7e4a0';
const HIGH = '#0b5d1e';
const ARC = '#e8112d';
const AIRPORT = '#2438c9';

/** The layers every variant draws: flat colors under the traces, and no lines at all. */
const BASE = {
  showland: true,
  landcolor: LAND,
  showocean: true,
  oceancolor: OCEAN,
  showlakes: false,
  showcoastlines: false,
  showframe: false,
  fitbounds: false,
};

/** A square in longitude and latitude, wound for d3 (clockwise: up the west side, then east). */
function square(id: string, west: number, south: number, east: number, north: number) {
  return {
    type: 'Feature',
    id,
    properties: { name: id },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ],
      ],
    },
  };
}

const REGIONS = {
  type: 'FeatureCollection',
  features: [
    square('MID', -10, -10, 10, 10),
    square('TOWER', 30, -5, 40, 5),
    square('BEHIND', 45, -20, 70, 20),
    square('WEST', -60, 10, -40, 30),
    square('FAR', 170, 30, -170, 50),
    square('FARTOP', 140, 20, 150, 30),
  ],
};

function regions(geo = 'geo'): Record<string, unknown> {
  return {
    type: 'choropleth',
    name: 'Index',
    geo,
    geojson: REGIONS,
    locations: ['MID', 'TOWER', 'BEHIND', 'WEST', 'FAR', 'FARTOP'],
    z: [10, 30, 20, 50, 40, 60],
    elevation: [0, 4, 0, 1, 0, 2],
    elevationscale: 0.5,
    colorscale: [
      [0, LOW],
      [1, HIGH],
    ],
    showscale: false,
    marker: { line: { color: '#ffffff', width: 1 } },
  };
}

/** The routes of `arcs`: one in front of the globe turned to (0°, 0°), one behind it. */
export const ROUTES = {
  front: { from: [-40, 30], to: [40, 30] },
  back: { from: [140, -30], to: [220, -30] },
  lift: 0.3,
} as const;

function arcs(): Record<string, unknown>[] {
  const { front, back, lift } = ROUTES;
  const ends = [front.from, front.to, back.from, back.to];
  return [
    {
      type: 'scattergeo',
      name: 'routes',
      mode: 'lines',
      lon: [front.from[0], front.to[0], null, back.from[0], back.to[0]],
      lat: [front.from[1], front.to[1], null, back.from[1], back.to[1]],
      line: { color: ARC, width: 4, lift },
      hoverinfo: 'skip',
    },
    {
      type: 'scattergeo',
      name: 'airports',
      mode: 'markers',
      lon: ends.map((p) => p[0]),
      lat: ends.map((p) => p[1]),
      text: ['a0', 'a1', 'b0', 'b1'],
      marker: { size: 10, color: AIRPORT, opacity: 1 },
    },
  ];
}

interface Variant {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

const VARIANTS: Record<string, () => Variant> = {
  regions: () => ({
    data: [regions()],
    layout: { geo: { ...BASE, projection: { type: 'globe3d' } } },
  }),
  flat: () => ({
    data: [regions()],
    layout: { geo: { ...BASE, projection: { type: 'orthographic' } } },
  }),
  arcs: () => ({
    data: arcs(),
    layout: { geo: { ...BASE, projection: { type: 'globe3d' } } },
  }),
  // A 3D scene and a globe in one figure: two GPU pickers on one render root.
  both: () => ({
    data: [
      {
        type: 'scatter3d',
        name: 'points',
        mode: 'markers',
        x: [0, 1, 2],
        y: [0, 1, 0],
        z: [0, 1, 2],
        marker: { size: 12, color: ARC },
      },
      regions(),
    ],
    layout: {
      scene: { domain: { x: [0, 0.46], y: [0, 1] } },
      geo: { ...BASE, projection: { type: 'globe3d' }, domain: { x: [0.54, 1], y: [0, 1] } },
    },
  }),
};

const RADIANS = Math.PI / 180;

/** Globe coordinates of a longitude and latitude at `radius` (the frame of `GeoSubplot.globeMatrix`). */
function onGlobe(lon: number, lat: number, radius: number): Vector3 {
  const r = radius * Math.cos(lat * RADIANS);
  return new Vector3(
    r * Math.sin(lon * RADIANS),
    radius * Math.sin(lat * RADIANS),
    r * Math.cos(lon * RADIANS),
  );
}

export function run(el: HTMLElement): ExampleHandle {
  const query = new URLSearchParams(location.search);
  const name = query.get('globe') ?? 'regions';
  const figureOf = (variantName: string): Figure => {
    const variant = (VARIANTS[variantName] ?? VARIANTS['regions']!)();
    return {
      data: variant.data,
      layout: {
        margin: { l: 20, r: 20, t: 20, b: 20 },
        showlegend: false,
        dragmode: 'pan',
        ...variant.layout,
      },
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
  /** A point in globe coordinates → page px, through the matrix the globe is drawn with. */
  const page = (sp: GeoSubplot, point: Vector3): GlobePagePoint => {
    const matrix = sp.globeMatrix(new Matrix4());
    const centre = new Vector3().setFromMatrixPosition(matrix);
    const world = point.applyMatrix4(matrix);
    const clip = sp.clipRect;
    const o = origin();
    return {
      x: o.left + clip.x + world.x,
      y: o.top + clip.y + clip.height - world.y,
      hidden:
        world.z < centre.z && Math.hypot(world.x - centre.x, world.y - centre.y) < sp.globeRadius,
    };
  };
  const globe: GlobeHook = {
    variant: name,
    figure: figureOf,
    toImage: (variantName) =>
      toImage(figureOf(variantName), { width: meta.size!.width, height: meta.size!.height }),
    toPage(lon, lat, height = 0, id = 'geo') {
      const sp = subplotOf(id);
      if (!sp?.view?.valid) return null;
      return page(sp, onGlobe(lon, lat, 1 + height));
    },
    arcTop(from, to, lift, id = 'geo') {
      const sp = subplotOf(id);
      if (!sp?.view?.valid) return null;
      const a = onGlobe(from[0], from[1], 1);
      const b = onGlobe(to[0], to[1], 1);
      const angle = a.angleTo(b);
      const middle = a.add(b).normalize();
      return page(sp, middle.multiplyScalar(1 + lift * angle));
    },
    view(id = 'geo') {
      const sp = subplotOf(id);
      const view = sp?.view;
      if (!sp || !view?.valid) return null;
      const now = view.toLayout();
      // The runtime names a subplot's viewport after its key.
      const names = [`subplot-${sp.viewportKey}`, `subplot-${sp.id}`];
      return {
        rotation: now.rotation,
        scale: now.scale,
        radius: sp.globeRadius,
        globe: sp.globe,
        viewports: chart.three.root.viewports
          .filter((vp) => names.includes(vp.name))
          .map((vp) => vp.kind),
      };
    },
  };

  const hook: GlobeInteractionHook = { chart, events: [], globe };
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
