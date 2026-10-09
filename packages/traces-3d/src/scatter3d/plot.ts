/**
 * The `scatter3d` view (plan E14.2), drawn with M6 wave 0's 3D primitives (render's lazily loaded
 * 3D chunk) in the trace's scene viewport, positions in linear coordinates under the scene's
 * transform (RTC-encoded by the primitives, so dates keep their precision):
 *
 * | Part                   | Primitive                                              | Picked |
 * | ---------------------- | ------------------------------------------------------ | ------ |
 * | markers (`sprite`)     | `Markers3D`: SDF symbols, one instanced draw call      | yes    |
 * | markers (`sphere`)     | `SphereSet`: ray-cast lit spheres, one draw call       | yes    |
 * | lines                  | `Line3D`: screen-space width and dashes, one draw call | yes    |
 * | lines (`tube`, `ribbon`) | the lazily loaded mesh primitive, lit (`line-mesh.ts`) | yes    |
 * | text                   | `TextPrimitive`, `billboard` + `screen` sizing         | no     |
 * | error bars             | one gapped `Line3D` for all three axes                 | no     |
 * | projections (shadows)  | one `Markers3D` per axis, on its far wall              | no     |
 * | `surfaceaxis` surface  | a three.js mesh through the points (Delaunay)          | no     |
 *
 * Opaque markers and lines write depth (the default look); translucent markers (`opacity < 1`)
 * blend and are sorted back to front as the camera moves. A camera move re-renders only, except
 * for the projections, which move to the walls that face the camera when those flip. Tube and
 * ribbon lines (`line.render`, E14.10) are built in scene units, so they are rebuilt when the
 * scene's transform changes (layout passes), not when the camera moves.
 */
import {
  richTextLabel,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type RGBAColor,
} from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  createTextPrimitive,
  linesMarkers3DModule,
  loadLinesMarkers3D,
  type LazyMeshPrimitive,
  type LinesMarkers3DModule,
  type Line3D,
  type MarkerData,
  type Markers3D,
  type Primitive,
  type SphereData,
  type SphereSet,
  type TextFont,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import {
  formatTemplate,
  type TracePlotContext,
  type TraceRenderer,
  type TraceUpdatePlan,
  type TraceView,
} from '@mk7s/holochart-runtime';
import {
  mapColor,
  markerStyle,
  resolveColorMapping,
  type ScatterCalc,
} from '@mk7s/holochart-traces-basic';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SRGBColorSpace,
} from 'three';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import {
  invalidateScenePicks,
  registerScenePickable,
  unregisterScenePickable,
} from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import { farWalls } from '../scene/spikes.ts';
import type { Scatter3dCalc } from './calc.ts';
import { hasLines3d, hasMarkers3d, hasText3d } from './defaults.ts';
import { ribbonMesh, tubeMesh, type LineMesh } from './line-mesh.ts';
import { surfaceTriangles } from './surface.ts';

type Container = Record<string, unknown>;

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

/** Translucent markers above this count are not depth-sorted (the CPU sort would stall). */
const MAX_SORTED = 200_000;

/** Render order of the trace's parts (after the axes' walls and lines, which draw at −3 / −2). */
function orders(index: number): { surface: number; lines: number; markers: number; text: number } {
  const base = 10 + index * 8;
  return { surface: base, lines: base + 1, markers: base + 2, text: base + 3 };
}

function at(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

function opacityOf(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

function rgba(css: unknown, fallback: RGBAColor): RGBAColor {
  return (typeof css === 'string' ? toRGBA(css) : null) ?? fallback;
}

/**
 * Stands in for the view's primitives while render's 3D chunk loads: the chart waits for its
 * `ready` (as for text still typesetting), so `chart.ready` means drawn, 3D parts included.
 */
class LoadingPrimitive implements Primitive<never> {
  readonly object = new Object3D();
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {}
}

/** A three.js mesh as a runtime-tracked primitive (the `surfaceaxis` surface). */
class MeshPrimitive implements Primitive<never> {
  readonly object: Mesh<BufferGeometry, MeshBasicMaterial>;
  constructor() {
    this.object = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ side: DoubleSide, transparent: true }),
    );
    this.object.frustumCulled = false;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

/** Line colors: one color, or per point through `line.colorscale` (mapped on the CPU). */
export function lineColors(
  trace: FullTrace,
  length: number,
  fullLayout: FullLayout | undefined,
): RGBAColor | Float32Array {
  const line = (trace['line'] ?? {}) as Container;
  const mapping = resolveColorMapping(line, fullLayout);
  const c = line['color'];
  if (Array.isArray(c) || ArrayBuffer.isView(c)) {
    const values = c as ArrayLike<unknown>;
    const out = new Float32Array(length * 4);
    for (let i = 0; i < length; i++) {
      const v = values[i];
      const color =
        typeof v === 'string'
          ? rgba(v, [0, 0, 0, 1])
          : mapping
            ? mapColor(typeof v === 'number' ? v : NaN, mapping)
            : ([0.5, 0.5, 0.5, 1] as RGBAColor);
      out.set(color, i * 4);
    }
    return out;
  }
  return rgba(c, [0.12, 0.47, 0.71, 1]);
}

/** Text anchors and px offset for a `textposition`, clearing a marker of radius `r` (px). */
export function textAnchor3d(
  position: string,
  r: number,
): Pick<TextLabel, 'anchorX' | 'anchorY' | 'offset'> {
  const pad = r > 0 ? r + 2 : 2;
  const v = position.includes('top') ? -1 : position.includes('bottom') ? 1 : 0;
  const h = position.includes('left') ? -1 : position.includes('right') ? 1 : 0;
  return {
    anchorX: h < 0 ? 'right' : h > 0 ? 'left' : 'center',
    anchorY: v < 0 ? 'bottom' : v > 0 ? 'top' : 'middle',
    offset: [h * pad, v * pad],
  };
}

/** Text labels of `mode` `text` (texttemplate over text), at the points, facing the camera. */
export function textLabels3d(trace: FullTrace, calc: Scatter3dCalc): TextLabel[] {
  const out: TextLabel[] = [];
  const font = (trace['textfont'] ?? {}) as Container;
  const template = trace['texttemplate'];
  const opacity = opacityOf(trace);
  const markers = hasMarkers3d(trace['mode']);
  for (let i = 0; i < calc.length; i++) {
    const x = calc.x[i]!;
    const y = calc.y[i]!;
    const z = calc.z[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const tpl = at(template, i);
    let raw: string;
    if (typeof tpl === 'string' && tpl !== '') {
      raw = formatTemplate(
        tpl,
        {
          values: {
            x: at(trace['x'], i),
            y: at(trace['y'], i),
            z: at(trace['z'], i),
            text: at(trace['text'], i),
            customdata: at(trace['customdata'], i),
            pointNumber: i,
          },
          fullData: trace,
          data: trace._input,
          pointIndex: i,
        },
        { fallback: '' },
      );
    } else {
      const t = at(trace['text'], i);
      raw = t === undefined || t === null ? '' : String(t);
    }
    if (raw === '') continue;
    const family = at(font['family'], i);
    const base: TextFont = {
      family: typeof family === 'string' ? family : 'sans-serif',
      size: Number(at(font['size'], i)) || 12,
      ...(font['weight'] !== undefined ? { weight: font['weight'] as TextFont['weight'] } : {}),
      ...(font['style'] === 'italic' ? { style: 'italic' as const } : {}),
    };
    const rich = richTextLabel(raw, base, { newlines: 'break' });
    const color = rgba(at(font['color'], i), [0.27, 0.27, 0.27, 1]);
    const size = typeof calc.markerSize === 'number' ? calc.markerSize : (calc.markerSize[i] ?? 0);
    const pos = at(trace['textposition'], i);
    out.push({
      text: rich ? rich.text : raw,
      x,
      y,
      z,
      font: rich ? rich.font : base,
      color: [color[0], color[1], color[2], color[3] * opacity],
      lineHeight: 1.3,
      ...textAnchor3d(typeof pos === 'string' ? pos : 'top center', markers ? size / 2 : 0),
      ...(rich?.runs ? { runs: rich.runs } : {}),
    });
  }
  return out;
}

/** The error bars as one gapped polyline with per-vertex colors and widths (linear space). */
export function errorSegments(
  trace: FullTrace,
  calc: Scatter3dCalc,
):
  | { x: Float64Array; y: Float64Array; z: Float64Array; color: Float32Array; width: Float32Array }
  | undefined {
  const total = calc.errors.reduce((n, e) => n + e.count, 0);
  if (total === 0) return undefined;
  const x = new Float64Array(total * 3);
  const y = new Float64Array(total * 3);
  const z = new Float64Array(total * 3);
  const color = new Float32Array(total * 12);
  const width = new Float32Array(total * 3);
  const opacity = opacityOf(trace);
  let k = 0;
  for (const bars of calc.errors) {
    let style = (trace[`error_${bars.letter}`] ?? {}) as Container;
    if (style['copy_zstyle'] === true) style = (trace['error_z'] ?? {}) as Container;
    const c = rgba(style['color'], [0.27, 0.27, 0.27, 1]);
    const rgbaOut: RGBAColor = [c[0], c[1], c[2], c[3] * opacity];
    const w = typeof style['thickness'] === 'number' ? style['thickness'] : 2;
    const d = bars.letter === 'x' ? 0 : bars.letter === 'y' ? 1 : 2;
    for (let i = 0; i < calc.length; i++) {
      const lo = bars.minus[i]!;
      const hi = bars.plus[i]!;
      if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
      for (let v = 0; v < 3; v++) {
        const j = k + v;
        const end = v === 0 ? lo : hi;
        x[j] = d === 0 ? end : calc.x[i]!;
        y[j] = d === 1 ? end : calc.y[i]!;
        z[j] = d === 2 ? end : calc.z[i]!;
        if (v === 2) x[j] = y[j] = z[j] = NaN;
        color.set(rgbaOut, j * 4);
        width[j] = w;
      }
      k += 3;
    }
  }
  // Lower ends clipped on log axes (−∞) run to far below the range: clamp to a finite value.
  for (const arr of [x, y, z]) {
    for (let j = 0; j < arr.length; j++) if (arr[j] === -Infinity) arr[j] = -1e300;
  }
  return { x, y, z, color, width };
}

/** `line.render` of a defaulted trace drawing lines (`'screen'` without lines too). */
export function lineRender3d(trace: FullTrace): 'screen' | 'tube' | 'ribbon' {
  const r = ((trace['line'] ?? {}) as Container)['render'];
  return hasLines3d(trace['mode']) && (r === 'tube' || r === 'ribbon') ? r : 'screen';
}

/** The identity transform: tube and ribbon meshes are built in scene units. */
const WORLD = { scaleX: 1, scaleY: 1, scaleZ: 1, offsetX: 0, offsetY: 0, offsetZ: 0 };

/**
 * The tube or ribbon mesh of a trace's line in scene units (`line-mesh.ts`): the points through
 * the scene's transform, the tube radius as a fraction of the axis box's longest side, the ribbon
 * width in axis units (default a twentieth of the axis range).
 */
export function lineMesh3d(
  trace: FullTrace,
  calc: Scatter3dCalc,
  scene: Pick<Scene3D, 'transform' | 'layout'>,
  fullLayout: FullLayout | undefined,
): LineMesh {
  const t = scene.transform;
  const n = calc.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = calc.x[i]! * t.scaleX + t.offsetX;
    y[i] = calc.y[i]! * t.scaleY + t.offsetY;
    z[i] = calc.z[i]! * t.scaleZ + t.offsetZ;
  }
  const line = (trace['line'] ?? {}) as Container;
  const input = {
    x,
    y,
    z,
    color: lineColors(trace, n, fullLayout),
    connectGaps: trace['connectgaps'] === true,
  };
  if (lineRender3d(trace) === 'tube') {
    const r = typeof line['radius'] === 'number' ? line['radius'] : 0.01;
    return tubeMesh(input, r * Math.max(...scene.layout.aspect));
  }
  const ribbon = (line['ribbon'] ?? {}) as Container;
  const d = ribbon['axis'] === 'x' ? 0 : ribbon['axis'] === 'z' ? 2 : 1;
  const range = scene.layout.axes[d].range;
  const width =
    typeof ribbon['width'] === 'number' ? ribbon['width'] : Math.abs(range[1] - range[0]) / 20;
  const scale = Math.abs(d === 0 ? t.scaleX : d === 1 ? t.scaleY : t.scaleZ);
  return ribbonMesh(input, d, (width * scale) / 2);
}

/** The linear coordinate of axis `d`'s far wall (see `farWalls`). */
function wallLinear(scene: Scene3D, d: number, side: 0 | 1): number {
  const t = scene.transform;
  const a = scene.layout.aspect[d]!;
  const world = side ? a / 2 : -a / 2;
  const scale = d === 0 ? t.scaleX : d === 1 ? t.scaleY : t.scaleZ;
  const offset = d === 0 ? t.offsetX : d === 1 ? t.offsetY : t.offsetZ;
  return (world - offset) / (scale || 1);
}

class Scatter3dView implements TraceView<Scatter3dCalc> {
  #ctx: TracePlotContext<Scatter3dCalc>;
  #scene: Scene3D | undefined;
  #offCamera: (() => void) | undefined;
  #markers: Markers3D | SphereSet | undefined;
  #markersKind = '';
  #line: Line3D | undefined;
  /** Tube or ribbon line (`line.render`), with its light rig subscription and build key. */
  #lineMesh: LazyMeshPrimitive | undefined;
  #offLineRig: (() => void) | undefined;
  #lineMeshKey = '';
  #errors: Line3D | undefined;
  #text: TextPrimitive | undefined;
  readonly #shadows: (Markers3D | undefined)[] = [undefined, undefined, undefined];
  #wallKey = '';
  #surface: MeshPrimitive | undefined;
  #surfaceKey = '';
  #loading: LoadingPrimitive | undefined;
  #disposed = false;

  constructor(ctx: TracePlotContext<Scatter3dCalc>) {
    this.#ctx = ctx;
    this.#sync(FULL);
  }

  update(ctx: TracePlotContext<Scatter3dCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#sync(plan);
  }

  dispose(): void {
    this.#disposed = true;
    this.#offCamera?.();
    this.#clear();
  }

  // ---- internals ----------------------------------------------------------------------------

  #sync(plan: TraceUpdatePlan): void {
    const ctx = this.#ctx;
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    let full = plan.calc || plan.plot;
    if (scene !== this.#scene) {
      this.#offCamera?.();
      this.#clear();
      this.#scene = scene;
      this.#offCamera = scene.onCameraChange(() => this.#placeShadows(false));
      full = true;
    }
    const m3d = linesMarkers3DModule();
    if (!m3d) {
      if (!this.#loading) {
        const ready = loadLinesMarkers3D().then(() => {
          const loading = this.#loading;
          this.#loading = undefined;
          if (this.#disposed) return;
          if (loading) this.#ctx.remove(loading);
          this.#sync(FULL);
        });
        this.#loading = new LoadingPrimitive(ready);
        ctx.add(this.#loading);
      }
      return;
    }
    if (full) this.#build(m3d, scene);
    else if (plan.style) this.#restyle(scene);
    const t = scene.transform;
    for (const p of this.#parts()) p.setTransform(t);
    if (full || plan.transform || plan.style) {
      this.#placeShadows(true);
      this.#placeSurface(scene, full);
      this.#placeLineMesh(scene, full || plan.style);
    }
    // Everything the pick ids refer to may have changed: hover picks again.
    invalidateScenePicks(scene);
    ctx.invalidate();
  }

  #parts(): Primitive<unknown>[] {
    const out: Primitive<unknown>[] = [];
    for (const p of [this.#markers, this.#line, this.#errors, this.#text, ...this.#shadows]) {
      if (p) out.push(p as Primitive<unknown>);
    }
    return out;
  }

  #remove(p: Primitive<unknown> | undefined): undefined {
    if (!p) return undefined;
    if (this.#scene) unregisterScenePickable(this.#scene, p as Markers3D);
    this.#ctx.remove(p);
    return undefined;
  }

  #clear(): void {
    this.#markers = this.#remove(this.#markers);
    this.#markersKind = '';
    this.#line = this.#remove(this.#line);
    this.#errors = this.#remove(this.#errors);
    this.#text = this.#remove(this.#text);
    for (let d = 0; d < 3; d++) this.#shadows[d] = this.#remove(this.#shadows[d]);
    this.#surface = this.#remove(this.#surface);
    this.#surfaceKey = '';
    this.#wallKey = '';
    this.#removeLineMesh();
  }

  #removeLineMesh(): void {
    this.#offLineRig?.();
    this.#offLineRig = undefined;
    this.#lineMesh = this.#remove(this.#lineMesh);
    this.#lineMeshKey = '';
  }

  #markerData(): { style: Partial<MarkerData>; translucent: boolean } {
    const { trace, calc, fullLayout } = this.#ctx;
    const style = markerStyle(trace, {
      calc: { length: calc.length, markerSize: calc.markerSize } as unknown as ScatterCalc,
      fullLayout,
    });
    const opacity = typeof style.opacity === 'number' ? style.opacity : 1;
    return { style, translucent: opacity < 1 };
  }

  #build(m3d: LinesMarkers3DModule, scene: Scene3D): void {
    const ctx = this.#ctx;
    const { trace, calc } = ctx;
    const order = orders(ctx.index);
    const mode = trace['mode'];
    const pos = { x: calc.x, y: calc.y, z: calc.z };

    // Markers.
    if (hasMarkers3d(mode)) {
      const { style, translucent } = this.#markerData();
      const sphere = (trace['marker'] as Container | undefined)?.['render'] === 'sphere';
      const sorted = translucent && calc.length <= MAX_SORTED;
      const kind = `${sphere ? 'sphere' : 'sprite'}:${sorted}`;
      if (kind !== this.#markersKind) {
        this.#markers = this.#remove(this.#markers);
        this.#markersKind = kind;
        const options = { depthSort: sorted, renderOrder: order.markers };
        this.#markers = sphere
          ? m3d.createSpheres(ctx.primitives, {}, options)
          : m3d.createMarkers3D(ctx.primitives, {}, options);
        ctx.add(this.#markers, scene.viewport);
      }
      if (sphere) (this.#markers as SphereSet).update({ ...pos, ...sphereStyle(style) });
      else (this.#markers as Markers3D).update({ ...pos, ...style });
      registerScenePickable(scene, this.#markers!, ctx.index);
    } else {
      this.#markers = this.#remove(this.#markers);
      this.#markersKind = '';
    }

    // Lines (tubes and ribbons: #placeLineMesh).
    if (lineRender3d(trace) !== 'screen') this.#line = this.#remove(this.#line);
    else if (hasLines3d(mode)) {
      const line = (trace['line'] ?? {}) as Container;
      const data = {
        ...pos,
        connectGaps: trace['connectgaps'] === true,
        color: lineColors(trace, calc.length, ctx.fullLayout),
        width: typeof line['width'] === 'number' ? line['width'] : 2,
        dash: typeof line['dash'] === 'string' ? line['dash'] : 'solid',
        opacity: opacityOf(trace),
        join: 'round' as const,
      };
      if (!this.#line) {
        this.#line = m3d.createLine3D(ctx.primitives, data, { renderOrder: order.lines });
        ctx.add(this.#line, scene.viewport);
      } else this.#line.update(data);
      registerScenePickable(scene, this.#line, ctx.index);
    } else this.#line = this.#remove(this.#line);

    // Error bars.
    const errors = errorSegments(trace, calc);
    if (errors) {
      const data = { ...errors, join: 'bevel' as const };
      if (!this.#errors) {
        this.#errors = m3d.createLine3D(ctx.primitives, data, { renderOrder: order.lines });
        ctx.add(this.#errors, scene.viewport);
      } else this.#errors.update(data);
    } else this.#errors = this.#remove(this.#errors);

    // Text.
    if (hasText3d(mode)) {
      const labels = textLabels3d(trace, calc);
      if (!this.#text) {
        this.#text = createTextPrimitive(ctx.primitives, {
          mode: 'billboard',
          sizing: 'screen',
          labels,
        });
        this.#text.object.renderOrder = order.text;
        ctx.add(this.#text, scene.viewport);
      } else this.#text.update({ labels });
    } else this.#text = this.#remove(this.#text);

    // Projections (created here, placed by #placeShadows).
    const projection = (trace['projection'] ?? {}) as Container;
    for (let d = 0; d < 3; d++) {
      const p = projection[['x', 'y', 'z'][d]!] as Container | undefined;
      const show = hasMarkers3d(mode) && p?.['show'] === true;
      if (show && !this.#shadows[d]) {
        const shadow = m3d.createMarkers3D(ctx.primitives, {}, { renderOrder: order.surface });
        this.#shadows[d] = shadow;
        ctx.add(shadow, scene.viewport);
      } else if (!show) this.#shadows[d] = this.#remove(this.#shadows[d]);
    }
    this.#wallKey = '';
  }

  #restyle(scene: Scene3D): void {
    const { trace, calc, fullLayout } = this.#ctx;
    const m = this.#markers;
    if (m) {
      const { style, translucent } = this.#markerData();
      const sorted = translucent && calc.length <= MAX_SORTED;
      if (!this.#markersKind.endsWith(`:${sorted}`)) {
        this.#build(linesMarkers3DModule()!, scene);
        return;
      }
      if (this.#markersKind.startsWith('sphere')) (m as SphereSet).update(sphereStyle(style));
      else (m as Markers3D).update(style);
    }
    if (this.#line) {
      const line = (trace['line'] ?? {}) as Container;
      this.#line.update({
        color: lineColors(trace, calc.length, fullLayout),
        width: typeof line['width'] === 'number' ? line['width'] : 2,
        dash: typeof line['dash'] === 'string' ? line['dash'] : 'solid',
        opacity: opacityOf(trace),
      });
    }
    const errors = errorSegments(trace, calc);
    if (errors && this.#errors) this.#errors.update({ color: errors.color, width: errors.width });
    if (this.#text) this.#text.update({ labels: textLabels3d(trace, calc) });
  }

  /** Put the projections on the far walls; `force`: also restyle (else only when walls flip). */
  #placeShadows(force: boolean): void {
    const scene = this.#scene;
    if (!scene || !this.#shadows.some(Boolean)) return;
    const walls = farWalls(scene);
    const key = walls.join('');
    if (!force && key === this.#wallKey) return;
    this.#wallKey = key;
    const { trace, calc } = this.#ctx;
    const { style } = this.#markerData();
    const projection = (trace['projection'] ?? {}) as Container;
    for (let d = 0; d < 3; d++) {
      const shadow = this.#shadows[d];
      if (!shadow) continue;
      const p = (projection[['x', 'y', 'z'][d]!] ?? {}) as Container;
      const scale = typeof p['scale'] === 'number' ? p['scale'] : 2 / 3;
      const alpha = typeof p['opacity'] === 'number' ? p['opacity'] : 1;
      const wall = wallLinear(scene, d, walls[d]!);
      const coords = [calc.x, calc.y, calc.z].map((c, k) =>
        k === d ? new Float64Array(calc.length).fill(wall) : c,
      );
      const size = style.size ?? 8;
      shadow.update({
        ...style,
        x: coords[0]!,
        y: coords[1]!,
        z: coords[2]!,
        size: typeof size === 'number' ? size * scale : Float32Array.from(size, (s) => s * scale),
        opacity:
          typeof style.opacity === 'number'
            ? style.opacity * alpha
            : Float32Array.from(style.opacity ?? [], (o) => o * alpha),
      });
      shadow.setTransform(scene.transform);
    }
    this.#ctx.invalidate();
  }

  /** The tube or ribbon line (`line.render`), rebuilt when the transform changed or `force`. */
  #placeLineMesh(scene: Scene3D, force: boolean): void {
    const { trace, calc, fullLayout } = this.#ctx;
    if (lineRender3d(trace) === 'screen') {
      this.#removeLineMesh();
      return;
    }
    const t = scene.transform;
    const key = [t.scaleX, t.offsetX, t.scaleY, t.offsetY, t.scaleZ, t.offsetZ].join(',');
    if (this.#lineMesh && !force && key === this.#lineMeshKey) return;
    this.#lineMeshKey = key;
    const mesh = lineMesh3d(trace, calc, scene, fullLayout);
    const line = (trace['line'] ?? {}) as Container;
    const data = {
      positions: mesh.positions,
      origin: mesh.origin,
      indices: mesh.indices,
      normals: mesh.normals,
      color: mesh.colors,
      opacity: opacityOf(trace),
      ...sceneMeshLighting(line, () => this.#ctx.invalidate()),
    };
    if (!this.#lineMesh) {
      this.#lineMesh = createLazyMeshPrimitive(this.#ctx.primitives, data);
      this.#lineMesh.object.name = `holochart:line3d-${lineRender3d(trace)}`;
      this.#ctx.add(this.#lineMesh, scene.viewport);
      this.#offLineRig = scene.useLightRig(this.#lineMesh);
    } else this.#lineMesh.update(data);
    // Hover maps a picked vertex to the point it was built around.
    this.#lineMesh.object.userData['hcPointIndex'] = mesh.pointIndex;
    this.#lineMesh.object.renderOrder = orders(this.#ctx.index).lines;
    this.#lineMesh.setTransform(WORLD);
    registerScenePickable(scene, this.#lineMesh, this.#ctx.index);
  }

  /** The `surfaceaxis` surface, triangulated in scene units (so per layout, when they change). */
  #placeSurface(scene: Scene3D, full: boolean): void {
    const { trace, calc } = this.#ctx;
    const axis = trace['surfaceaxis'];
    if (typeof axis !== 'number' || axis < 0 || axis > 2) {
      this.#surface = this.#remove(this.#surface);
      this.#surfaceKey = '';
      return;
    }
    const t = scene.transform;
    const key = [t.scaleX, t.offsetX, t.scaleY, t.offsetY, t.scaleZ, t.offsetZ].join(',');
    if (!this.#surface) {
      this.#surface = new MeshPrimitive();
      this.#surface.object.renderOrder = orders(this.#ctx.index).surface;
      this.#ctx.add(this.#surface, scene.viewport);
    }
    const mesh = this.#surface.object;
    if (full || key !== this.#surfaceKey) {
      this.#surfaceKey = key;
      const surface = surfaceTriangles(calc.x, calc.y, calc.z, axis, t);
      const geometry = mesh.geometry;
      geometry.setAttribute('position', new BufferAttribute(surface.positions, 3));
      geometry.setIndex(new BufferAttribute(surface.index, 1));
      geometry.computeBoundingSphere();
    }
    const c = rgba(trace['surfacecolor'], [0.12, 0.47, 0.71, 1]);
    const alpha = c[3] * opacityOf(trace);
    mesh.material.color.setRGB(c[0], c[1], c[2], SRGBColorSpace);
    mesh.material.opacity = alpha;
    const opaque = alpha >= 1;
    mesh.material.transparent = !opaque;
    mesh.material.depthWrite = opaque;
  }
}

/** Marker style → sphere data (colors, colorscale, px diameters, opacity). */
function sphereStyle(style: Partial<MarkerData>): Partial<SphereData> {
  const out: Partial<SphereData> = {};
  if (style.size !== undefined) out.size = style.size;
  if (style.opacity !== undefined) out.opacity = style.opacity;
  if (style.color !== undefined) out.color = style.color;
  out.colorValues = style.colorValues ?? null;
  out.colorscale = style.colorscale ?? null;
  if (style.cmin !== undefined) out.cmin = style.cmin;
  if (style.cmax !== undefined) out.cmax = style.cmax;
  if (style.cmid !== undefined) out.cmid = style.cmid;
  if (style.reversescale !== undefined) out.reversescale = style.reversescale;
  return out;
}

export const scatter3dRenderer: TraceRenderer<Scatter3dCalc> = {
  create: (ctx) => new Scatter3dView(ctx),
};
