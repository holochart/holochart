/**
 * The laid-out scene of a pipeline pass (plan E14.1a, E14.1b): where it is on the page, each
 * axis' range and scale, the resolved aspect ratio and the linear → world transform. Built once per
 * layout pass by the 3D traces' shared `crossTraceLayout` ({@link sceneCrossTraceLayout}) from
 * their extremes, and by the scene component for scenes whose traces are all hidden.
 */
import type { FullLayout, FullTrace, Scale } from '@mk7s/holochart-core';
import type { DataTransform, ViewportRect, Vec3 } from '@mk7s/holochart-render';
import {
  domainRect,
  type DomainLayoutContext,
  type DomainTraceEntry,
} from '@mk7s/holochart-runtime';
import {
  sceneAspect,
  sceneRange,
  sceneScale,
  sceneTransform,
  unionExtent,
  type AspectMode,
  type SceneExtremes,
} from './axes.ts';
import { SCENE_LETTERS, sceneOf, type SceneLetter } from './layout-defaults.ts';

/** One axis of a laid-out scene. @experimental */
export interface SceneAxis {
  readonly letter: SceneLetter;
  /** The defaulted axis container (`fullLayout.scene.xaxis`, …). */
  readonly full: Readonly<Record<string, unknown>>;
  /** Data ↔ linear mapping; its range is the axis range (linear coordinates). */
  readonly scale: Scale;
  /** Range in linear coordinates (`range[0] > range[1]` when reversed). */
  readonly range: readonly [number, number];
}

/** A scene laid out for one pass. @experimental */
export interface SceneLayout {
  readonly id: string;
  /** The scene's rect (its `domain` on the plot area), container px, top-left origin. */
  readonly rect: Readonly<ViewportRect>;
  readonly axes: readonly [SceneAxis, SceneAxis, SceneAxis];
  /** The aspect ratio in use (Plotly writes it back to `fullLayout.scene.aspectratio`). */
  readonly aspect: Vec3;
  /** Linear coordinates → scene units, all three axes (`z` in `scaleZ` / `offsetZ`). */
  readonly transform: Required<DataTransform>;
}

/**
 * What every 3D trace's calc carries (the contract of {@link sceneCrossTraceLayout}): its
 * autorange contribution, set by `calc`, and the laid-out scene, set before `plot`.
 * @experimental
 */
export interface SceneCalc {
  readonly sceneExtremes: SceneExtremes;
  scene?: SceneLayout | undefined;
  /**
   * A cross-trace step of the trace type (e.g. `bar3d` stacking, M6 wave 2): run by
   * {@link sceneCrossTraceLayout} once per scene and pass, before the scene is laid out, with the
   * scene's entries whose calc carries this same function (in trace order). It may update their
   * `sceneExtremes` in place; it must be idempotent.
   */
  readonly sceneCrossTrace?: SceneCrossTrace;
}

/** See {@link SceneCalc.sceneCrossTrace}. @experimental */
export type SceneCrossTrace = (
  entries: readonly DomainTraceEntry<SceneCalc>[],
  fullLayout: FullLayout,
  sceneId: string,
) => void;

function extent(v: unknown): [number, number] | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? [v[0], v[1]]
    : undefined;
}

/**
 * The scene domain of a 3D trace: the runtime's `subplotDomain` hook (placed like polar).
 * @experimental
 */
export function sceneSubplotDomain(
  trace: FullTrace,
  fullLayout: FullLayout,
): { x: [number, number]; y: [number, number] } | undefined {
  const scene = fullLayout?.[sceneOf(trace)] as
    { domain?: { x?: unknown; y?: unknown } } | undefined;
  const d = scene?.domain;
  if (!d) return undefined;
  return { x: extent(d.x) ?? [0, 1], y: extent(d.y) ?? [0, 1] };
}

/**
 * Lay a scene out: its rect on `plotArea`, each axis' range from the union of `extremes`
 * ({@link sceneRange}), the aspect ratio (`aspectmode`, from the data spans) and the transform.
 * Writes the aspect ratio in use and the axis ranges (range values) into the full layout, as
 * Plotly does.
 * @internal
 */
export function buildSceneLayout(
  fullLayout: FullLayout,
  id: string,
  plotArea: Readonly<ViewportRect>,
  extremes: readonly SceneExtremes[],
): SceneLayout | undefined {
  const scene = fullLayout[id] as Record<string, unknown> | undefined;
  if (!scene) return undefined;
  const d = (scene['domain'] ?? {}) as Record<string, unknown>;
  const rect = domainRect(plotArea, extent(d['x']) ?? [0, 1], extent(d['y']) ?? [0, 1]);
  const spans: Vec3 = [0, 0, 0];
  const axes = SCENE_LETTERS.map((letter, i): SceneAxis => {
    const full = (scene[`${letter}axis`] ?? {}) as Record<string, unknown>;
    const scale = sceneScale(full);
    const data = unionExtent(extremes.map((e) => e[letter]));
    spans[i] = data ? data[1] - data[0] : 0;
    const range = sceneRange(scale, full, data);
    scale.setRange(range[0], range[1]);
    full['range'] = [scale.l2r(range[0]), scale.l2r(range[1])];
    return { letter, full, scale, range };
  }) as [SceneAxis, SceneAxis, SceneAxis];
  const r = (scene['aspectratio'] ?? {}) as Record<string, unknown>;
  const manual: Vec3 = [Number(r['x']) || 1, Number(r['y']) || 1, Number(r['z']) || 1];
  const aspect = sceneAspect(
    (scene['aspectmode'] ?? 'auto') as AspectMode,
    manual,
    axes.map((a) => String(a.full['type'])) as [string, string, string],
    spans,
  );
  scene['aspectratio'] = { x: aspect[0], y: aspect[1], z: aspect[2] };
  return {
    id,
    rect,
    axes,
    aspect,
    transform: sceneTransform(
      axes.map((a) => a.range),
      aspect,
    ),
  };
}

/** Scenes laid out in the latest pass, by the layout they were built for. */
const LAID_OUT = new WeakMap<FullLayout, Map<string, SceneLayout>>();

/** The scene {@link sceneCrossTraceLayout} laid out for `fullLayout`, if it ran for it. */
export function laidOutScene(fullLayout: FullLayout, id: string): SceneLayout | undefined {
  return LAID_OUT.get(fullLayout)?.get(id);
}

/**
 * The shared `crossTraceLayout` of every 3D trace module (register it as the module's
 * `crossTraceLayout`, with `subplotDomain: sceneSubplotDomain`): once per layout pass, with every
 * visible 3D trace, it lays out each scene from its traces' `sceneExtremes` and hands the result to
 * each of them (`calc.scene`) and to the scene component.
 * @experimental
 */
export function sceneCrossTraceLayout(
  entries: readonly DomainTraceEntry<SceneCalc>[],
  ctx: DomainLayoutContext,
): void {
  const byScene = new Map<string, DomainTraceEntry<SceneCalc>[]>();
  for (const e of entries) {
    const id = sceneOf(e.trace);
    const list = byScene.get(id);
    if (list) list.push(e);
    else byScene.set(id, [e]);
  }
  const built = new Map<string, SceneLayout>();
  for (const [id, list] of byScene) {
    const steps = new Map<SceneCrossTrace, DomainTraceEntry<SceneCalc>[]>();
    for (const e of list) {
      const step = e.calc.sceneCrossTrace;
      if (step) steps.set(step, [...(steps.get(step) ?? []), e]);
    }
    for (const [step, members] of steps) step(members, ctx.fullLayout, id);
    const layout = buildSceneLayout(
      ctx.fullLayout,
      id,
      ctx.plotArea,
      list.map((e) => e.calc.sceneExtremes),
    );
    if (!layout) continue;
    built.set(id, layout);
    for (const e of list) e.calc.scene = layout;
  }
  LAID_OUT.set(ctx.fullLayout, built);
}
