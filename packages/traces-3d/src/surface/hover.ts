/**
 * Hover of `surface` (plan E14.3, on the scene's 3D hover of E14.1d), after plotly.js
 * `surface/convert.js` `handlePick`: the scene's GPU pick (`scene/pick.ts`) tells whether the
 * surface is under the pointer (and not hidden by another trace); the pointer's ray then hits the
 * drawn triangles on the CPU (`pick.ts`, exact), the hit snaps to the nearest grid point, and the
 * label shows that point's `x`, `y` and `z` (`sceneHoverPoint`: Plotly's `x: …<br>y: …<br>z: …`,
 * then `text`; spikes), anchored at the point on screen. `hovertemplate` also gets
 * `%{surfacecolor}`; events report `pointNumber: [row, column]`. The view draws the highlight lines
 * (`contours.*.highlight`) through the same ray hit ({@link surfaceHitAt}).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import { mapColor, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { Vector3 } from 'three';
import { sceneHoverPoint, scenePicks } from '../scene/hover.ts';
import type { SceneLayout } from '../scene/layout.ts';
import type { Scene3D } from '../scene/scene.ts';
import type { SurfaceCalc } from './calc.ts';
import { surfaceColorMapping } from './colors.ts';
import { gridX, gridY, type SurfaceGrid } from './grid.ts';
import { SurfacePicker, type Ray, type SurfaceHit } from './pick.ts';
import type { Vec3 } from '@mk7s/holochart-render';

const near = new Vector3();
const far = new Vector3();

/**
 * The ray through container point `(cx, cy)` in the scene's linear coordinates, or null outside
 * the scene's viewport.
 */
export function sceneRay(scene: Scene3D, cx: number, cy: number): Ray | null {
  const r = scene.viewport.rect;
  if (cx < r.x || cx > r.x + r.width || cy < r.y || cy > r.y + r.height) return null;
  const nx = ((cx - r.x) / r.width) * 2 - 1;
  const ny = 1 - ((cy - r.y) / r.height) * 2;
  const camera = scene.viewport.camera;
  near.set(nx, ny, -1).unproject(camera);
  far.set(nx, ny, 1).unproject(camera);
  const t = scene.transform;
  const s: Vec3 = [t.scaleX, t.scaleY, t.scaleZ];
  const o: Vec3 = [t.offsetX, t.offsetY, t.offsetZ];
  const origin: Vec3 = [0, 0, 0];
  const dir: Vec3 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const n = near.getComponent(a);
    origin[a] = (n - o[a]!) / s[a]!;
    dir[a] = (far.getComponent(a) - n) / s[a]!;
  }
  return origin.every(Number.isFinite) && dir.every(Number.isFinite) ? { origin, dir } : null;
}

/** The scene's axis box (linear), where the drawn surface is clipped. */
export function sceneClip(layout: SceneLayout): { min: Vec3; max: Vec3 } {
  const [x, y, z] = layout.axes;
  return {
    min: [Math.min(...x.range), Math.min(...y.range), Math.min(...z.range)],
    max: [Math.max(...x.range), Math.max(...y.range), Math.max(...z.range)],
  };
}

interface HitCache {
  calc: SurfaceCalc;
  camera: unknown;
  layout: SceneLayout;
  zoom: number;
  cx: number;
  cy: number;
  hit: SurfaceHit | null;
}

let cache: HitCache | null = null;

/**
 * The surface under container point `(cx, cy)` in `scene` (see the module comment), cached for
 * the last point and camera (hover and the highlight lines ask for the same one).
 */
export function surfaceHitAt(
  calc: SurfaceCalc,
  scene: Scene3D,
  cx: number,
  cy: number,
): SurfaceHit | null {
  const c = cache;
  if (
    c &&
    c.calc === calc &&
    c.camera === scene.camera &&
    c.layout === scene.layout &&
    c.zoom === scene.orthoZoom &&
    c.cx === cx &&
    c.cy === cy
  ) {
    return c.hit;
  }
  let hit: SurfaceHit | null = null;
  const grid = calc.grid;
  const ray = grid ? sceneRay(scene, cx, cy) : null;
  if (grid && ray) {
    calc.picker ??= new SurfacePicker(grid);
    hit = calc.picker.intersect(ray, sceneClip(scene.layout));
  }
  cache = {
    calc,
    camera: scene.camera,
    layout: scene.layout,
    zoom: scene.orthoZoom,
    cx,
    cy,
    hit,
  };
  return hit;
}

/** The linear coordinates of grid point `(i, j)`. */
export function gridPoint(grid: SurfaceGrid, i: number, j: number): Vec3 {
  return [gridX(grid, i, j), gridY(grid, i, j), grid.z[j * grid.nx + i]!];
}

/** Whether a scene takes hover (`scene.hovermode` is not `false`). */
export function sceneHovers(fullLayout: FullLayout, scene: Scene3D): boolean {
  const s = fullLayout[scene.id] as Record<string, unknown> | undefined;
  return s?.['hovermode'] !== false;
}

/** The `hoverPoints` of `surface` (see the module comment). */
export function surfaceHoverPoints(
  calc: SurfaceCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const grid = calc.grid;
  // The scene's GPU pick says whether the surface is under the pointer (and not hidden by
  // another trace); the ray cast finds the exact point.
  const pick = grid ? scenePicks(trace, query, ctx) : undefined;
  if (!grid || !pick) return [];
  const hit = surfaceHitAt(calc, pick.scene, query.cx!, query.cy!);
  const k0 = pick.hits[0]!.pointIndex;
  const i = hit ? hit.i : k0 % grid.nx;
  const j = hit ? hit.j : Math.floor(k0 / grid.nx);
  const k = j * grid.nx + i;
  const p = gridPoint(grid, i, j);
  if (!p.every(Number.isFinite)) return [];
  const axes = pick.scene.layout.axes;
  const data = (a: 0 | 1 | 2): unknown => axes[a].scale.l2d(p[a]!);
  const value = calc.color ? calc.color[k]! : p[2];
  const mapping = surfaceColorMapping(trace, ctx.fullLayout);
  return [
    sceneHoverPoint(pick, trace, {
      pointIndex: k,
      x: p[0],
      y: p[1],
      z: p[2],
      cell: [j, i],
      values: { x: data(0), y: data(1), z: data(2) },
      ...(mapping && Number.isFinite(value) ? { color: rgbaToCss(mapColor(value, mapping)) } : {}),
      ...(calc.surfacecolor && calc.color ? { fields: { surfacecolor: calc.color[k] } } : {}),
    }),
  ];
}
