/**
 * The base layers of a 3D globe (backlog GEO8, ADR-028): what the geo component draws in the
 * globe's 3D viewport instead of projecting the layers through d3.
 *
 * | Layer                                   | Drawn as                                   | Depth              |
 * | --------------------------------------- | ------------------------------------------ | ------------------ |
 * | the body (`ocean`, shown or not)        | the whole sphere as a mesh, opaque, lit    | tests and writes   |
 * | `land`, `lakes`                         | a mesh on the unit sphere, front faces, lit | neither            |
 * | `subunits`, `countries`, `coastlines`, `rivers`, `lataxis`, `lonaxis` | 3D lines just above the sphere | tests against the body |
 *
 * Everything is in globe coordinates and parented under the globe of the viewport
 * (`globe-scene.ts`), so a rotation or a zoom is one matrix, set by the subplot: nothing here runs
 * when the globe turns. The frame is a circle on screen whatever the rotation, and stays a 2D line
 * in the subplot's 2D viewport (the geo component draws it).
 *
 * ## Geometry
 *
 * Built once per geometry object and kept ({@link MESHES}, {@link LINES}): the basemap's layers
 * are the same objects for every chart of a page, so a second globe, a relayout and a switch
 * between `'orthographic'` and `'globe3d'` build nothing. The caches hold typed arrays only and
 * let go of them with the basemap.
 *
 * ## Depth and order
 *
 * The body is the one mesh of the base layers that writes depth: it hides the far half of every
 * line, and what rises above the surface (a choropleth's prisms) writes depth too. Land and lakes
 * lie on the surface. They test depth, so a prism in front of a lake hides it, and write none, so
 * two layers on the surface never fight each other: among themselves they are drawn in layer
 * order. They show their front faces only, which is what removes the far hemisphere.
 *
 * So that a layer on the surface never fights the body either, the body is a little smaller than
 * the globe, and lines lie on a slightly larger sphere, so they never dip under the surface
 * between two vertices. The numbers, in globe radii:
 *
 * - the body is at {@link GLOBE_BODY_RADIUS} (0.998): its silhouette is 0.002 inside the globe's
 *   circle (0.6 px on a globe 300 px in radius), under the frame;
 * - a mesh on the surface has edges of at most 5° of arc, whose middle sags to 0.99905: above
 *   the body by 0.001, 2,900 steps of a 24-bit depth buffer over the camera's 6 radii of depth;
 * - a line is split into pieces of at most {@link GLOBE_LINE_DENSIFY}° of arc, whose middle sags
 *   0.000038 below its ends;
 * - line layer `k` (bottom to top) lies at `1 + GLOBE_LINE_LIFT + k · GLOBE_LINE_STEP`: 1.0005
 *   to 1.0010. A step between layers is larger than a piece's sag, so of two lines that cross,
 *   the upper layer's is in front along its whole length. On screen a line is at most 0.001 radii
 *   from where the surface under it is (0.3 px at 300 px), at the limb, and nothing in the middle.
 *
 * three.js draws every opaque object before every translucent one, and orders each of the two
 * lists by `renderOrder`. So that the layer order of `order.ts` holds whatever the colors are:
 *
 * - **the body** is always opaque: a translucent `oceancolor` is mixed with the background first;
 * - **land** lies on the body and on nothing else, so a translucent `landcolor` is mixed with the
 *   body's color and drawn opaque, which looks exactly the same;
 * - **lakes** are always drawn with the translucent objects ({@link BLENDED}): on a choropleth map
 *   they are above the regions, which may be translucent themselves;
 * - **lines** are drawn with the translucent objects (smooth edges, no depth written), except
 *   the layers under the regions of a choropleth map, which are drawn opaque when their color is,
 *   so that an opaque region covers them as it does on a flat map. A translucent line color under
 *   the regions is the one case that comes out differently from a flat map: it is drawn over
 *   opaque regions.
 */
import { toRGBA } from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  linesMarkers3DModule,
  loadLinesMarkers3D,
  loadMeshModule,
  meshModuleLoaded,
  type Blend3D,
  type LazyMeshPrimitive,
  type Line3D,
  type LinesMarkers3DModule,
  type Primitive,
  type PrimitiveContext,
  type RGBA,
  type Viewport,
} from '@mk7s/holochart-render';
import { baseLayerStyle, isFillLayer, shownBaseLayers, type BaseLayerName } from './base-layers.ts';
import { GLOBE_LIGHTING, lightGlobeMesh } from './globe-light.ts';
import { globeModule, loadGlobe, type GlobeModule } from './globe-loader.ts';
import { addToGlobe, globeScene } from './globe-scene.ts';
import { geoOrder } from './order.ts';
import type { GeoInput } from './sink.ts';
import type { FullGeoLayout } from './types.ts';

/** The longest edge of the body's facets, in degrees of arc: 10,242 vertices, 20,480 triangles. */
export const GLOBE_SHELL_EDGE = 2.5;
/**
 * The radius of the body, in globe radii: under every mesh on the surface (see the module comment),
 * whose flat triangles dip to 0.99905 between their corners.
 */
export const GLOBE_BODY_RADIUS = 0.998;
/** The longest piece of a line on the globe, in degrees of arc. */
export const GLOBE_LINE_DENSIFY = 1;
/** How far the lowest line layer lies above the unit sphere, in globe radii. */
export const GLOBE_LINE_LIFT = 5e-4;
/** How far each line layer lies above the one below it, in globe radii. */
export const GLOBE_LINE_STEP = 1e-4;

/**
 * The opacity that puts a mesh among the translucent objects, which three.js draws after the
 * opaque ones: it changes a color by less than one step of 255.
 */
const BLENDED = 1 - 1 / 1024;

/** A layer drawn on the globe: every base layer but the frame; `ocean` is the body. */
export type GlobeLayerName = Exclude<BaseLayerName, 'frame'>;
type GlobeLineName = Exclude<GlobeLayerName, 'ocean' | 'land' | 'lakes'>;

/** The line layers bottom to top, in the order of a choropleth map (see the module comment). */
const LINE_RANK: Readonly<Record<GlobeLineName, number>> = {
  subunits: 0,
  countries: 1,
  coastlines: 2,
  lataxis: 3,
  lonaxis: 4,
  rivers: 5,
};

/** The radius of the sphere a line layer lies on, in globe radii. */
export function globeLineRadius(name: GlobeLineName): number {
  return 1 + GLOBE_LINE_LIFT + LINE_RANK[name] * GLOBE_LINE_STEP;
}

// ---- The code a globe draws with ------------------------------------------------------------------

/** The lazy chunks a globe draws with, loaded. */
export interface GlobeParts {
  /** The geometry builders (`globe/index.ts`). */
  readonly globe: GlobeModule;
  /** Render's 3D lines. */
  readonly lines: LinesMarkers3DModule;
}

/**
 * The chunks when all of them are loaded, else `undefined`: the globe's geometry, render's 3D
 * lines, and render's mesh chunk (so that a mesh created now draws now, and its `ready` has
 * nothing to wait for).
 */
export function globeParts(): GlobeParts | undefined {
  const globe = globeModule();
  const lines = linesMarkers3DModule();
  return globe && lines && meshModuleLoaded() ? { globe, lines } : undefined;
}

/** Load what {@link globeParts} needs. Rejects when one of the chunks cannot be loaded. */
export function loadGlobeParts(): Promise<void> {
  return Promise.all([loadGlobe(), loadLinesMarkers3D(), loadMeshModule()]).then(() => undefined);
}

// ---- Geometry, built once -------------------------------------------------------------------------

interface MeshGeometry {
  readonly positions: Float32Array;
  /** The point of the unit sphere over each vertex: its outward normal. */
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

interface LineGeometry {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly starts: Uint32Array;
}

/** The mesh of each polygon geometry that was drawn on a globe, by the geometry object. */
const MESHES = new WeakMap<object, MeshGeometry>();
/** The lines of each geometry that was drawn on a globe, by the geometry object and the radius. */
const LINES = new WeakMap<object, Map<number, LineGeometry>>();
/** The whole sphere. */
let shell: MeshGeometry | undefined;

/** The geometry of the body: there is one, whatever the map. */
const SHELL = { type: 'Sphere' } as const;

function meshOf(parts: GlobeParts, source: object): MeshGeometry {
  if (source === SHELL) {
    if (!shell) {
      const built = parts.globe.buildSphereShell(GLOBE_SHELL_EDGE);
      // The body is a little smaller than the globe (see `GLOBE_BODY_RADIUS`); its normals are
      // still those of the unit sphere.
      const positions = built.positions.map((v) => v * GLOBE_BODY_RADIUS);
      shell = { positions, normals: built.positions, indices: built.indices };
    }
    return shell;
  }
  let mesh = MESHES.get(source);
  if (!mesh) {
    const built = parts.globe.buildSphereMesh(source as GeoInput);
    // On the unit sphere a vertex is its own outward normal.
    mesh = { positions: built.positions, normals: built.positions, indices: built.indices };
    MESHES.set(source, mesh);
  }
  return mesh;
}

function linesOf(parts: GlobeParts, source: object, radius: number): LineGeometry {
  let byRadius = LINES.get(source);
  if (!byRadius) LINES.set(source, (byRadius = new Map()));
  let lines = byRadius.get(radius);
  if (!lines) {
    const built = parts.globe.buildSphereLines(source as GeoInput, {
      densify: GLOBE_LINE_DENSIFY,
      radius,
    });
    lines = { x: built.x, y: built.y, z: built.z, starts: built.starts };
    byRadius.set(radius, lines);
  }
  return lines;
}

// ---- Colors ---------------------------------------------------------------------------------------

const WHITE: RGBA = [1, 1, 1, 1];

/** `top` over the opaque `under`, as an opaque color. */
function over(top: Readonly<RGBA>, under: Readonly<RGBA>): RGBA {
  const a = Math.min(1, Math.max(0, top[3]));
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
}

/**
 * The color of the globe's body: `oceancolor` when the ocean is shown, else the subplot's
 * `bgcolor`. The body is always drawn, because it is what hides the far side, and always opaque:
 * a translucent color is mixed with what is under it (the background, and white under that).
 */
export function globeBodyColor(layout: FullGeoLayout): RGBA {
  const background = over(toRGBA(layout.bgcolor) ?? WHITE, WHITE);
  if (!layout.showocean) return background;
  return over(toRGBA(layout.oceancolor) ?? background, background);
}

// ---- The layers -----------------------------------------------------------------------------------

/** What a layer's primitive was last given. */
interface Drawn {
  /** The geometry object the primitive's geometry was built from. */
  source: object;
  /** Changes when the primitive's color, width or dash does. */
  style: string;
}

type GlobeLayer = Drawn &
  (
    | { readonly kind: 'mesh'; readonly primitive: LazyMeshPrimitive }
    | { readonly kind: 'line'; readonly primitive: Line3D; readonly blend: Blend3D }
  );

/** The part of a draw context the layers are added through. */
export interface GlobeHost {
  readonly primitives: PrimitiveContext;
  add<T>(primitive: Primitive<T>, viewport?: Viewport): Primitive<T>;
  remove<T>(primitive: Primitive<T>): void;
}

/** What {@link GlobeLayers.sync} draws. */
export interface GlobeLayersInput {
  readonly layout: FullGeoLayout;
  /** The subplot has a choropleth: Plotly's other layer order. */
  readonly hasChoropleth: boolean;
  /**
   * The geometry of a layer, in degrees: the same object for as long as it is the same geometry.
   * `undefined` for a layer whose data is not there (yet): it is not drawn.
   */
  geometry(name: Exclude<GlobeLayerName, 'ocean'>): GeoInput | undefined;
}

/** The base layers of one globe, in its 3D viewport (see the module comment). */
export class GlobeLayers {
  readonly #layers = new Map<GlobeLayerName, GlobeLayer>();
  #viewport: Viewport | undefined;

  /** Whether anything is drawn. */
  get drawn(): boolean {
    return this.#layers.size > 0;
  }

  /**
   * Bring the layers up to date with a layout and its geometry. Geometry is built (or taken from
   * the cache) for a layer that is new or whose geometry object changed, and a primitive is told
   * of a color, a width or a dash only when it changed: called again with nothing new, as on
   * every step of a rotation, it does nothing at all.
   */
  sync(host: GlobeHost, viewport: Viewport, parts: GlobeParts, input: GlobeLayersInput): void {
    if (this.#viewport !== viewport) {
      this.drop(host);
      this.#viewport = viewport;
    }
    const { layout, hasChoropleth } = input;
    const order = geoOrder(hasChoropleth);
    const body = globeBodyColor(layout);
    const kept = new Set<GlobeLayerName>(['ocean']);
    this.#mesh(host, viewport, parts, 'ocean', SHELL, body, order.ocean);
    for (const name of shownBaseLayers(layout, hasChoropleth)) {
      if (name === 'ocean' || name === 'frame') continue;
      const source = input.geometry(name) as object | undefined;
      if (!source) continue;
      kept.add(name);
      if (isFillLayer(name)) {
        const color = baseLayerStyle(layout, name).color;
        // Land lies on the body alone: mixed with it, a translucent land is drawn opaque.
        const drawn = name === 'land' ? over(color, body) : color;
        this.#mesh(host, viewport, parts, name, source, drawn, order[name]);
      } else {
        // Under the regions of a choropleth an opaque line is drawn opaque, so they cover it.
        const blend: Blend3D =
          hasChoropleth && order[name] < order.backplot ? 'auto' : 'translucent';
        this.#line(
          host,
          viewport,
          parts,
          name as GlobeLineName,
          source,
          layout,
          blend,
          order[name],
        );
      }
    }
    for (const [name, layer] of this.#layers) {
      if (kept.has(name)) continue;
      host.remove(layer.primitive);
      this.#layers.delete(name);
    }
    globeScene(viewport).body = this.#layers.get('ocean')?.primitive.object;
  }

  /** Remove and dispose every layer. */
  drop(host: GlobeHost): void {
    for (const layer of this.#layers.values()) host.remove(layer.primitive);
    this.#layers.clear();
    const viewport = this.#viewport;
    this.#viewport = undefined;
    // A viewport the runtime has removed took its globe with it.
    if (viewport && !viewport.disposed) globeScene(viewport).body = undefined;
  }

  #mesh(
    host: GlobeHost,
    viewport: Viewport,
    parts: GlobeParts,
    name: GlobeLayerName,
    source: object,
    color: RGBA,
    renderOrder: number,
  ): void {
    const body = name === 'ocean';
    const opacity = name === 'lakes' ? BLENDED : 1;
    const style = `${color.join()}|${opacity}`;
    let layer = this.#layers.get(name);
    if (layer?.kind !== 'mesh') {
      const { positions, normals, indices } = meshOf(parts, source);
      const primitive = createLazyMeshPrimitive(host.primitives, {
        positions,
        normals,
        indices,
        color,
        opacity,
        side: 'front',
        // Every mesh tests depth, so what rises above the surface (a prism) hides the surface
        // behind it; only the body writes it. Layers on the surface cannot fight each other, as
        // none writes, nor the body, which lies under them.
        depthTest: true,
        depthWrite: body,
        lighting: GLOBE_LIGHTING,
        // Front faces of a sphere never overlap: there is nothing to sort when the globe turns.
        sortTriangles: false,
      });
      lightGlobeMesh(primitive);
      host.add(primitive, viewport);
      addToGlobe(viewport, primitive.object);
      layer = { kind: 'mesh', primitive, source, style };
      this.#layers.set(name, layer);
    } else {
      if (layer.source !== source) {
        const { positions, normals, indices } = meshOf(parts, source);
        layer.primitive.update({ positions, normals, indices });
        layer.source = source;
      }
      if (layer.style !== style) {
        layer.primitive.update({ color, opacity });
        layer.style = style;
      }
    }
    layer.primitive.object.renderOrder = renderOrder;
  }

  #line(
    host: GlobeHost,
    viewport: Viewport,
    parts: GlobeParts,
    name: GlobeLineName,
    source: object,
    layout: FullGeoLayout,
    blend: Blend3D,
    renderOrder: number,
  ): void {
    const { color, width, dash, miterLimit, key } = baseLayerStyle(layout, name);
    let layer = this.#layers.get(name);
    // How a line blends is fixed when it is made.
    if (layer && (layer.kind !== 'line' || layer.blend !== blend)) {
      host.remove(layer.primitive);
      this.#layers.delete(name);
      layer = undefined;
    }
    if (!layer) {
      const { x, y, z, starts } = linesOf(parts, source, globeLineRadius(name));
      const primitive = parts.lines.createLine3D(
        host.primitives,
        { x, y, z, starts, color, width, dash, miterLimit },
        { depthTest: true, blend, renderOrder },
      );
      host.add(primitive, viewport);
      addToGlobe(viewport, primitive.object);
      this.#layers.set(name, { kind: 'line', primitive, blend, source, style: key });
      return;
    }
    if (layer.source !== source) {
      const { x, y, z, starts } = linesOf(parts, source, globeLineRadius(name));
      layer.primitive.update({ x, y, z, starts });
      layer.source = source;
    }
    if (layer.style !== key) {
      layer.primitive.update({ color, width, dash, miterLimit });
      layer.style = key;
    }
    layer.primitive.object.renderOrder = renderOrder;
  }
}
