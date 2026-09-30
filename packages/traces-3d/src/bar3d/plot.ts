/**
 * The `bar3d` view (plan E14.9): one {@link Bar3DPrimitive} (every bar in one instanced draw
 * call) in the trace's scene: boxes from each bar's footprint and its stacked bottom → top, colored
 * per bar (colors, or numbers through the marker colorscale), the edges from `marker.line`, lit
 * with Plotly's model or the trace's `material` (and the scene's light rig), hoverable through the
 * scene's GPU picking.
 */
import { isArrayLike, toRGBA, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { RGBA } from '@mk7s/holochart-render';
import type { TracePlotContext, TraceUpdatePlan, TraceView } from '@mk7s/holochart-runtime';
import { mapColor, resolveColorMapping } from '@mk7s/holochart-traces-basic';
import { sceneMeshLighting } from '../scene/lighting-attributes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import { registerScenePickable, unregisterScenePickable } from '../scene/pick.ts';
import { acquireScene, type Scene3D } from '../scene/scene.ts';
import type { Bar3dCalc } from './calc.ts';
import { Bar3DPrimitive, type Bar3DData } from './primitive.ts';

type Ctx = TracePlotContext<Bar3dCalc>;
type Container = Record<string, unknown>;

const GRAY: RGBA = [0.5, 0.5, 0.5, 1];

/** The color of bar `i` (sRGB, straight alpha): a color, or a number through the colorscale. */
export function bar3dColorAt(
  marker: Container,
  i: number,
  mapping: ReturnType<typeof resolveColorMapping>,
): RGBA {
  const c = marker['color'];
  const v = isArrayLike(c) ? (c as ArrayLike<unknown>)[i] : c;
  if (typeof v === 'string') return toRGBA(v) ?? GRAY;
  return mapping && typeof v === 'number' ? mapColor(v, mapping) : GRAY;
}

/** Bar colors of a defaulted trace: one color, or 4 floats per bar (sRGB, straight alpha). */
export function bar3dColors(
  trace: FullTrace,
  count: number,
  fullLayout: FullLayout | undefined,
): RGBA | Float32Array {
  const marker = (trace['marker'] ?? {}) as Container;
  if (!isArrayLike(marker['color'])) return bar3dColorAt(marker, 0, undefined);
  const mapping = resolveColorMapping(marker, fullLayout);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) out.set(bar3dColorAt(marker, i, mapping), i * 4);
  return out;
}

/**
 * The primitive's data for a trace, its calc and the scene's z range (a bottom at −∞, at or
 * below zero on a log axis, starts at the bottom of the range).
 */
export function bar3dData(
  ctx: Pick<Ctx, 'trace' | 'fullLayout'>,
  calc: Bar3dCalc,
  zRange: readonly [number, number],
  onTextureLoad?: () => void,
): Partial<Bar3DData> {
  const trace = ctx.trace;
  const n = calc.count;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const dz = new Float64Array(n);
  const floor = Math.min(zRange[0], zRange[1]);
  for (let i = 0; i < n; i++) {
    const ok = Number.isFinite(calc.value[i]!);
    let lo = Math.min(calc.bottomL[i]!, calc.topL[i]!);
    const hi = Math.max(calc.bottomL[i]!, calc.topL[i]!);
    if (lo === -Infinity) lo = Math.min(floor, hi);
    x[i] = calc.x[i]! - calc.width[i]! / 2;
    y[i] = calc.y[i]! - calc.depth[i]! / 2;
    z[i] = ok ? lo : NaN;
    dx[i] = calc.width[i]!;
    dy[i] = calc.depth[i]!;
    dz[i] = ok ? hi - lo : NaN;
  }
  const marker = (trace['marker'] ?? {}) as Container;
  const line = (marker['line'] ?? {}) as Container;
  const edge = (typeof line['color'] === 'string' ? toRGBA(line['color']) : null) ?? [0, 0, 0, 1];
  const width = Number(line['width']);
  const opacity = Number(trace['opacity']);
  const markerOpacity = Number(marker['opacity']);
  const { lighting, lightposition, material, receiveShadow } = sceneMeshLighting(
    trace,
    onTextureLoad,
  );
  return {
    x,
    y,
    z,
    dx,
    dy,
    dz,
    count: n,
    color: bar3dColors(trace, n, ctx.fullLayout),
    opacity:
      (Number.isFinite(opacity) ? opacity : 1) *
      (Number.isFinite(markerOpacity) ? markerOpacity : 1),
    edgeColor: edge,
    edgeWidth: width > 0 ? width : 0,
    lighting: lighting ?? {},
    lightposition,
    material,
    receiveShadow,
  };
}

/** See the module comment. */
export class Bar3dView implements TraceView<Bar3dCalc> {
  #scene: Scene3D | undefined;
  #bars: Bar3DPrimitive | null = null;
  #offRig: (() => void) | undefined;

  constructor(ctx: Ctx) {
    this.update(ctx);
  }

  update(ctx: Ctx, _plan?: TraceUpdatePlan): void {
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    if (scene !== this.#scene) this.#detach(ctx);
    this.#scene = scene;
    const data = bar3dData(ctx, ctx.calc, scene.layout.axes[2].range, () => ctx.invalidate());
    if (!this.#bars) {
      this.#bars = new Bar3DPrimitive(ctx.primitives, data);
      ctx.add(this.#bars, scene.viewport);
      this.#offRig = scene.useLightRig(this.#bars);
    } else this.#bars.update(data);
    this.#bars.object.renderOrder = ctx.index;
    this.#bars.setTransform(scene.transform);
    registerScenePickable(scene, this.#bars, ctx.index);
    ctx.invalidate();
  }

  dispose(): void {
    this.#offRig?.();
    if (this.#scene && this.#bars) unregisterScenePickable(this.#scene, this.#bars);
  }

  #detach(ctx: Ctx): void {
    this.#offRig?.();
    this.#offRig = undefined;
    if (this.#bars) {
      if (this.#scene) unregisterScenePickable(this.#scene, this.#bars);
      ctx.remove(this.#bars);
      this.#bars = null;
    }
  }
}
