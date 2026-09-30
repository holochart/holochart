/**
 * GPU picking for 3D hover (plan E14.1d, ADR-010): one shared pick state per scene.
 *
 * 3D trace views register what they draw ({@link registerScenePickable}); the scene component
 * gives the scene a picker for its chart's render root ({@link attachScenePicking}). Hover asks
 * {@link ScenePicking.hits} for the ids under the pointer: GPU picks resolve asynchronously, so the
 * first ask at a position starts a pick (one in flight at a time, the newest position waiting:
 * the runtime's latest-wins queue) and answers with the previous result while the pointer stays
 * within the pick radius of it; when the pick resolves, `chart.refreshHover()` runs hover again,
 * which then gets the new hits. Every trace of the scene reads the same pick: one GPU pick per
 * pointer position whatever the trace count.
 *
 * The result is only valid for the view it was picked in: a camera move, a redraw of a trace or a
 * new layout bump {@link ScenePicking.version}, and hover drops older results. A camera move with
 * a label up also re-runs hover (the label hides while the camera moves) and, once the camera has
 * been still for {@link REST_MS}, hovers again so the label comes back at the point's new place.
 */
import {
  createPicker,
  type MeshPickElement,
  type Picker,
  type PickResult,
  type PickTarget,
} from '@mk7s/holochart-render';
import { createLatestQueue, type Chart, type LatestQueue } from '@mk7s/holochart-runtime';
import type { Vec3 } from './camera.ts';
import type { Scene3D } from './scene.ts';

/** Pick radius of 3D hover in CSS px (gl-plot3d's `pickRadius`). */
export const SCENE_PICK_RADIUS = 10;

/** How long the camera must rest before a hover hidden by its motion comes back, ms. */
export const REST_MS = 150;

/** Options of {@link registerScenePickable}. */
export interface ScenePickableOptions {
  /** What a generic mesh's pick ids count (see render's `MeshPickElement`); primitives ignore it. */
  readonly element?: MeshPickElement;
  /** Hides what is behind it from picks without being hovered itself. */
  readonly occludeOnly?: boolean;
}

interface Registration {
  traceIndex: number;
  options: ScenePickableOptions;
  handle: number | undefined;
}

interface PickRequest {
  readonly cx: number;
  readonly cy: number;
  readonly version: number;
}

interface PickState extends PickRequest {
  readonly hits: readonly PickResult[];
}

const NONE: readonly PickResult[] = [];

/** One render root's picker, shared by its scenes (the scene component disposes it). */
const PICKERS = new WeakMap<object, Picker>();

/** The pick and hover state of one scene (see the module comment). */
export class ScenePicking {
  readonly scene: Scene3D;
  /** Bumped whenever what is drawn where changes; older pick results are dropped. */
  version = 0;
  /**
   * World positions of the points the latest hover built (key `trace:point`), for the spikes of
   * the one that wins (the scene component reads them on `hover`).
   */
  readonly hovered = new Map<string, Vec3>();
  #chart: Chart | undefined;
  #picker: Picker | undefined;
  readonly #targets = new Map<PickTarget, Registration>();
  #queue: LatestQueue<PickRequest> | undefined;
  #requested: PickRequest | undefined;
  #result: PickState | undefined;
  /** The latest hover got hits from this scene (a label may be up). */
  #shown = false;
  /** A label was up when the camera started moving: bring it back when the camera rests. */
  #resume = false;
  #rest: ReturnType<typeof setTimeout> | undefined;
  #hoveredAt = { cx: NaN, cy: NaN, version: -1 };

  constructor(scene: Scene3D) {
    this.scene = scene;
    scene.onCameraChange(() => this.#cameraMoved());
  }

  /** Make `target` pickable as trace `traceIndex` (again: updates the index and options). */
  register(target: PickTarget, traceIndex: number, options: ScenePickableOptions = {}): void {
    let reg = this.#targets.get(target);
    if (!reg) this.#targets.set(target, (reg = { traceIndex, options, handle: undefined }));
    reg.traceIndex = traceIndex;
    reg.options = options;
    if (this.#picker) {
      try {
        reg.handle = this.#picker.add(this.scene.viewport, target, this.#add(reg));
      } catch {
        // The picker was disposed with its chart's view: no picking until a new one attaches.
        this.#picker = undefined;
      }
    }
    this.invalidate();
  }

  unregister(target: PickTarget): void {
    const reg = this.#targets.get(target);
    if (!reg) return;
    this.#targets.delete(target);
    if (reg.handle !== undefined) this.#picker?.remove(reg.handle);
    this.invalidate();
  }

  /** Pick with `picker` from now on (the scene component's, for its chart's render root). */
  attach(chart: Chart, picker: Picker): void {
    this.#chart = chart;
    if (picker === this.#picker) return;
    this.#queue?.dispose();
    this.#queue = undefined;
    this.#picker = picker;
    this.#requested = undefined;
    this.#result = undefined;
    for (const [target, reg] of this.#targets) {
      reg.handle = picker.add(this.scene.viewport, target, this.#add(reg));
    }
  }

  /** What is drawn changed (data, style, layout): results picked before are stale. */
  invalidate(): void {
    this.version++;
  }

  /**
   * The ids within {@link SCENE_PICK_RADIUS} of container point `(cx, cy)`, nearest first, as of
   * the latest pick near there for the current view (see the module comment). Starts a pick when
   * none is running or done for this position and view.
   */
  hits(cx: number, cy: number): readonly PickResult[] {
    if (cx !== this.#hoveredAt.cx || cy !== this.#hoveredAt.cy) {
      this.hovered.clear();
      this.#hoveredAt = { cx, cy, version: this.version };
    }
    const r = this.#result;
    const current = r !== undefined && r.version === this.version;
    if (!current || r.cx !== cx || r.cy !== cy) this.#request(cx, cy);
    const hits = current && Math.hypot(r.cx - cx, r.cy - cy) <= SCENE_PICK_RADIUS ? r.hits : NONE;
    this.#shown = hits.length > 0;
    return hits;
  }

  dispose(): void {
    clearTimeout(this.#rest);
    this.#queue?.dispose();
    this.#queue = undefined;
    for (const reg of this.#targets.values()) {
      if (reg.handle !== undefined) this.#picker?.remove(reg.handle);
      reg.handle = undefined;
    }
    this.#picker = undefined;
    this.#chart = undefined;
  }

  #add(reg: Registration): {
    traceIndex: number;
    element?: MeshPickElement;
    occludeOnly?: boolean;
  } {
    return {
      traceIndex: reg.traceIndex,
      ...(reg.options.element ? { element: reg.options.element } : {}),
      ...(reg.options.occludeOnly ? { occludeOnly: true } : {}),
    };
  }

  #request(cx: number, cy: number): void {
    const q = this.#requested;
    if (q && q.cx === cx && q.cy === cy && q.version === this.version) return;
    const picker = this.#picker;
    if (!picker) return;
    const request: PickRequest = { cx, cy, version: this.version };
    this.#requested = request;
    this.#queue ??= createLatestQueue(
      (req: PickRequest) =>
        this.#picker
          ? this.#picker.pickIn(this.scene.viewport, req.cx, req.cy, {
              radius: SCENE_PICK_RADIUS,
              mode: 'all',
            })
          : Promise.resolve([]),
      (hits: PickResult[], req: PickRequest) => this.#deliver(hits, req),
    );
    this.#queue.push(request);
  }

  #deliver(hits: readonly PickResult[], req: PickRequest): void {
    if (req.version !== this.version) {
      // The view changed while picking: hover asks again for the current one.
      if (this.#requested === req) this.#requested = undefined;
      return;
    }
    this.#result = { ...req, hits };
    this.#chart?.refreshHover();
  }

  #cameraMoved(): void {
    this.invalidate();
    if (this.#shown) {
      // Hover again now: the label hides (its pick is for the old view) until the camera rests.
      this.#shown = false;
      this.#resume = true;
      this.#chart?.refreshHover();
    }
    if (!this.#resume) return;
    clearTimeout(this.#rest);
    this.#rest = setTimeout(() => {
      this.#resume = false;
      this.#chart?.refreshHover();
    }, REST_MS);
  }
}

const STATES = new WeakMap<Scene3D, ScenePicking>();

/** The pick state of `scene` (created on first use). */
export function scenePicking(scene: Scene3D): ScenePicking {
  let state = STATES.get(scene);
  if (!state) STATES.set(scene, (state = new ScenePicking(scene)));
  return state;
}

/**
 * Make `target` (a pickable primitive such as `Markers3D`, `Line3D`, `SphereSet`, or any
 * `Object3D` whose meshes are picked) hoverable as trace `traceIndex` in `scene`. Call it when the
 * view creates the object and whenever the trace index may have changed (every update is fine);
 * {@link unregisterScenePickable} when the object goes.
 */
export function registerScenePickable(
  scene: Scene3D,
  target: PickTarget,
  traceIndex: number,
  options?: ScenePickableOptions,
): void {
  scenePicking(scene).register(target, traceIndex, options);
}

/**
 * What `scene` draws changed (a view's data, style or layout update): hover picks again instead of
 * reusing ids picked from the old drawing. Call it from every view update that changes geometry.
 */
export function invalidateScenePicks(scene: Scene3D): void {
  STATES.get(scene)?.invalidate();
}

/** Stop picking `target` in `scene`. */
export function unregisterScenePickable(scene: Scene3D, target: PickTarget): void {
  STATES.get(scene)?.unregister(target);
}

/**
 * Give `scene` the picker of `chart`'s render root (created once per root; the scene component
 * calls this on every draw and disposes it with {@link disposeScenePicker}).
 */
export function attachScenePicking(scene: Scene3D, chart: Chart): Picker {
  const root = chart.three.root;
  let picker = PICKERS.get(root);
  if (!picker) PICKERS.set(root, (picker = createPicker(root)));
  scenePicking(scene).attach(chart, picker);
  return picker;
}

/** Dispose the picker of a render root (the scene component's view, when it goes). */
export function disposeScenePicker(root: object): void {
  PICKERS.get(root)?.dispose();
  PICKERS.delete(root);
}
