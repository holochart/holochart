/**
 * 3D spikes (plan E14.1d), after gl-spikes3d as Plotly's `gl3d/scene.js` configures it: on hover,
 * a line from the hovered point to the wall of each axis with `showspikes` (the far wall drawn
 * behind the data, perpendicular to that axis) and, with `spikesides`, the same line projected
 * onto the other two walls, reaching the box edges. `spikecolor` and `spikethickness` (px) per
 * axis. Drawn with the screen-space 3D line primitive (lazily loaded), in scene units.
 */
import type { Line3D, Vec3 } from '@mk7s/holochart-render';
import { toRGBA } from '@mk7s/holochart-core';
import { linesMarkers3DModule, loadLinesMarkers3D } from '@mk7s/holochart-render';
import type { ComponentDrawContext } from '@mk7s/holochart-runtime';
import { SCENE_LETTERS } from './layout-defaults.ts';
import type { Scene3D } from './scene.ts';
import { closestCorner } from './walls.ts';

type Container = Record<string, unknown>;

/** Name of the spikes' three.js object (tests and devtools find it by it). */
export const SPIKES_NAME = 'holochart:scene-spikes';

/** Draw order of the spikes: over the data (traces use orders ≥ 0). */
const SPIKE_ORDER = 1000;

/** The spike settings of one axis. */
export interface SpikeAxis {
  readonly show: boolean;
  readonly sides: boolean;
  /** sRGB 0–1 RGBA. */
  readonly color: readonly [number, number, number, number];
  /** px. */
  readonly thickness: number;
}

/** The spike lines as one gapped polyline (NaN rows between segments), scene units. */
export interface SpikeLines {
  x: number[];
  y: number[];
  z: number[];
  /** RGBA per vertex. */
  color: number[];
  /** px per vertex. */
  width: number[];
}

/**
 * The far wall of each axis for the scene's camera (the wall drawn behind the data): `1` for the
 * high side (`+a/2`), `0` for the low side, as `walls.ts` picks them.
 */
export function farWalls(scene: Scene3D): [0 | 1, 0 | 1, 0 | 1] {
  const cam = scene.camera;
  const toward: Vec3 =
    scene.projection === 'orthographic'
      ? [cam.eye[0] - cam.center[0], cam.eye[1] - cam.center[1], cam.eye[2] - cam.center[2]]
      : cam.eye;
  const closest = closestCorner(toward);
  return [closest & 1 ? 0 : 1, closest & 2 ? 0 : 1, closest & 4 ? 0 : 1];
}

/**
 * Spike segments for a hovered point `p` (scene units) in a box of half sizes `half`, with the
 * far walls `walls` (see {@link farWalls}). Pure.
 */
export function spikeLines(
  p: Vec3,
  half: Vec3,
  walls: readonly (0 | 1)[],
  axes: readonly SpikeAxis[],
): SpikeLines {
  const out: SpikeLines = { x: [], y: [], z: [], color: [], width: [] };
  const wall = (d: number): number => (walls[d] ? half[d]! : -half[d]!);
  const push = (a: Vec3, b: Vec3, s: SpikeAxis): void => {
    if (out.x.length > 0) {
      out.x.push(NaN);
      out.y.push(NaN);
      out.z.push(NaN);
      out.color.push(...s.color);
      out.width.push(s.thickness);
    }
    for (const q of [a, b]) {
      out.x.push(q[0]);
      out.y.push(q[1]);
      out.z.push(q[2]);
      out.color.push(...s.color);
      out.width.push(s.thickness);
    }
  };
  for (let d = 0; d < 3; d++) {
    const s = axes[d];
    if (!s?.show || !(s.thickness > 0) || s.color[3] <= 0) continue;
    const foot: Vec3 = [p[0], p[1], p[2]];
    foot[d] = wall(d);
    push(p, foot, s);
    if (!s.sides) continue;
    // The same spike on the other two walls: from the point's shadow there to the edge.
    for (const e of [(d + 1) % 3, (d + 2) % 3]) {
      const a: Vec3 = [p[0], p[1], p[2]];
      a[e] = wall(e);
      const b: Vec3 = [a[0], a[1], a[2]];
      b[d] = wall(d);
      push(a, b, s);
    }
  }
  return out;
}

/** The spike settings of a defaulted scene's axes. */
export function spikeAxes(full: Container): SpikeAxis[] {
  return SCENE_LETTERS.map((letter) => {
    const ax = (full[`${letter}axis`] ?? {}) as Container;
    const color = toRGBA(String(ax['spikecolor'] ?? ax['color'] ?? '#444')) ?? [
      0.27, 0.27, 0.27, 1,
    ];
    return {
      show: ax['showspikes'] !== false && ax['visible'] !== false,
      sides: ax['spikesides'] !== false,
      color: [color[0], color[1], color[2], color[3]] as const,
      thickness: typeof ax['spikethickness'] === 'number' ? ax['spikethickness'] : 2,
    };
  });
}

/** The spikes of one scene (owned by the scene component, like its axes). */
export class SceneSpikes {
  readonly scene: Scene3D;
  #ctx: ComponentDrawContext;
  #line: Line3D | undefined;
  /** The point shown, scene units (`undefined`: hidden). */
  #point: Vec3 | undefined;
  #disposed = false;

  constructor(ctx: ComponentDrawContext, scene: Scene3D) {
    this.#ctx = ctx;
    this.scene = scene;
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    if (this.#point) this.show(this.#point);
  }

  /** Spikes from `point` (scene units) for the current camera. */
  show(point: Vec3): void {
    this.#point = point;
    const full = (this.#ctx.fullLayout[this.scene.id] ?? {}) as Container;
    const a = this.scene.layout.aspect;
    const lines = spikeLines(
      point,
      [a[0] / 2, a[1] / 2, a[2] / 2],
      farWalls(this.scene),
      spikeAxes(full),
    );
    if (lines.x.length === 0) {
      this.hide();
      return;
    }
    const m3d = linesMarkers3DModule();
    if (!m3d) {
      void loadLinesMarkers3D().then(() => {
        if (!this.#disposed && this.#point === point) this.show(point);
      });
      return;
    }
    const data = {
      x: lines.x,
      y: lines.y,
      z: lines.z,
      color: new Float32Array(lines.color),
      width: new Float32Array(lines.width),
      join: 'bevel' as const,
    };
    if (!this.#line) {
      this.#line = m3d.createLine3D(this.#ctx.primitives, data, { renderOrder: SPIKE_ORDER });
      this.#line.object.name = SPIKES_NAME;
      this.#ctx.add(this.#line, this.scene.viewport);
    } else this.#line.update(data);
    this.#line.object.visible = true;
    this.#ctx.invalidate();
  }

  hide(): void {
    this.#point = undefined;
    if (this.#line?.object.visible) {
      this.#line.object.visible = false;
      this.#ctx.invalidate();
    }
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#line) this.#ctx.remove(this.#line);
    this.#line = undefined;
  }
}
