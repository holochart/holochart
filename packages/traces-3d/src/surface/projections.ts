/**
 * Contour lines projected onto the scene's walls (`contours.{x, y, z}.project.{x, y, z}`, plan
 * E14.3): the lines of `contours.ts` drawn with the 3D line primitive (the lazily loaded 3D lines
 * chunk), one line object per (contoured axis, wall). A projection is the same polylines with the
 * wall's axis set to the wall's position: the far wall across that axis from the camera (like
 * Plotly's, it follows the camera; the line data is rewritten when the wall changes sides).
 */
import {
  loadLinesMarkers3D,
  type ColorInput,
  type DataTransform,
  type Line3D,
  type LinesMarkers3DModule,
  type Primitive,
  type PrimitiveContext,
  type ViewportSize,
  type Vec3,
} from '@mk7s/holochart-render';
import { Group } from 'three';
import type { ContourPolylines } from './contours.ts';

/** One projected set of lines. */
export interface ProjectionSpec {
  /** Unique per (contoured axis, wall), e.g. `'z→z'`. */
  readonly key: string;
  /** The wall's axis (0 x, 1 y, 2 z). */
  readonly wall: 0 | 1 | 2;
  readonly lines: ContourPolylines;
  /** One sRGB color, or one per point (4 floats each, NaN separators included). */
  readonly color: ColorInput;
  readonly width: number;
  readonly opacity: number;
}

/** Scene position of the far wall across each axis (see the module comment). */
export function farWalls(
  eye: Readonly<Vec3>,
  center: Readonly<Vec3>,
  aspect: Readonly<Vec3>,
): Vec3 {
  return [0, 1, 2].map((a) =>
    eye[a]! - center[a]! >= 0 ? -aspect[a]! / 2 : aspect[a]! / 2,
  ) as Vec3;
}

/** The linear coordinate of scene position `at` on axis `wall` under `t`. */
export function wallLinear(t: Required<DataTransform>, wall: 0 | 1 | 2, at: number): number {
  const [scale, offset] =
    wall === 0 ? [t.scaleX, t.offsetX] : wall === 1 ? [t.scaleY, t.offsetY] : [t.scaleZ, t.offsetZ];
  return (at - offset) / scale;
}

interface Entry {
  line: Line3D;
  spec: ProjectionSpec;
  /** The linear wall coordinate the line's data was written with. */
  at: number;
}

/** The projected lines of one surface (see the module comment). */
export class ProjectionLines implements Primitive<never> {
  readonly object = new Group();
  readonly #context: PrimitiveContext;
  readonly #lines = new Map<string, Entry>();
  #specs: readonly ProjectionSpec[] = [];
  #transform: Required<DataTransform> | null = null;
  #walls: Vec3 = [0, 0, 0];
  #viewport: ViewportSize | null = null;
  #mod: LinesMarkers3DModule | null = null;
  #ready: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(context: PrimitiveContext) {
    this.#context = context;
    this.object.name = 'holochart:surface-projections';
  }

  /** Resolves once the line code has loaded (when lines were asked for). */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /** Set the projected lines (replaces the previous ones). */
  setLines(specs: readonly ProjectionSpec[]): void {
    this.#specs = specs;
    if (specs.length > 0 && !this.#mod) {
      this.#ready = loadLinesMarkers3D().then(
        (mod) => {
          this.#mod = mod;
          if (!this.#disposed) this.#sync();
          this.#context.invalidate();
        },
        (error: unknown) => console.error('[holochart] could not load the 3D lines:', error),
      );
      return;
    }
    this.#sync();
  }

  /** The scene transform and the wall positions (scene units). */
  setScene(transform: Required<DataTransform>, walls: Readonly<Vec3>): void {
    this.#transform = transform;
    this.#walls = [...walls];
    for (const entry of this.#lines.values()) this.#place(entry);
    this.#context.invalidate();
  }

  update(): void {}

  setTransform(): void {}

  setViewport(size: ViewportSize): void {
    this.#viewport = { ...size };
    for (const { line } of this.#lines.values()) line.setViewport(size);
  }

  dispose(): void {
    this.#disposed = true;
    for (const { line } of this.#lines.values()) line.dispose();
    this.#lines.clear();
    this.object.removeFromParent();
  }

  /**
   * Put a line on its wall: its data with the wall's axis set to the wall's linear coordinate
   * (rewritten only when the wall moves), drawn with the scene transform.
   */
  #place(entry: Entry, force = false): void {
    const t = this.#transform;
    if (!t) return;
    const { spec, line } = entry;
    const at = wallLinear(t, spec.wall, this.#walls[spec.wall]);
    if (force || at !== entry.at) {
      entry.at = at;
      const coord = (a: 0 | 1 | 2, v: readonly number[]): Float64Array =>
        a === spec.wall
          ? Float64Array.from(v, (p) => (Number.isNaN(p) ? NaN : at))
          : Float64Array.from(v);
      line.update({
        x: coord(0, spec.lines.x),
        y: coord(1, spec.lines.y),
        z: coord(2, spec.lines.z),
        color: spec.color,
        width: spec.width,
        opacity: spec.opacity,
        cap: 'round',
        join: 'round',
      });
    }
    line.setTransform(t);
  }

  #sync(): void {
    const mod = this.#mod;
    if (!mod) return;
    const keep = new Set<string>();
    for (const spec of this.#specs) {
      keep.add(spec.key);
      let entry = this.#lines.get(spec.key);
      if (entry) entry.spec = spec;
      else {
        // Lines on the walls blend (no depth writes, smooth edges), right after the walls and
        // their grid lines (render orders −3, −2) and under translucent traces.
        const line = mod.createLine3D(this.#context, {}, { blend: 'translucent', renderOrder: -1 });
        entry = { line, spec, at: NaN };
        this.#lines.set(spec.key, entry);
        this.object.add(entry.line.object);
        if (this.#viewport) entry.line.setViewport(this.#viewport);
      }
      this.#place(entry, true);
    }
    for (const [key, { line }] of this.#lines) {
      if (keep.has(key)) continue;
      line.dispose();
      this.#lines.delete(key);
    }
    this.#context.invalidate();
  }
}
