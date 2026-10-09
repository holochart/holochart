/**
 * GPU picking on a globe (backlog GEO8, ADR-010, ADR-028 "Hover"): what is drawn under the
 * pointer in the 3D viewport of a `'globe3d'` subplot, so that a prism is hit where it is drawn
 * and nothing behind the globe is.
 *
 * A trace view registers the meshes it draws ({@link GlobePicking.register}, which gives each a
 * key) and hover asks {@link GlobePicking.hits} for the ids under the pointer. The globe's body
 * (`globeScene(viewport).body`, the opaque sphere the geo component draws) is registered as an
 * occluder: it hides what is behind it and is never a hit.
 *
 * GPU picks resolve asynchronously, so this follows the 3D scenes' pattern
 * (`traces-3d/src/scene/pick.ts`):
 *
 * - the first ask at a position starts a pick, **one in flight at a time**, the newest position
 *   waiting (the runtime's latest-wins queue), and is answered with the pick before it: a label
 *   stays up for the one pick it takes to learn what is under the new position;
 * - when the pick resolves, `chart.refreshHover()` runs hover again, which then gets its hits;
 * - a result is of the view it was picked in: when the globe moves (`GlobeScene.version`) or
 *   what is drawn changes ({@link GlobePicking.changed}) older results are dropped. A label that
 *   was up hides at once and comes back, at what is then under the pointer, when the globe has
 *   rested for {@link REST_MS}: no pick is made per frame of a rotation.
 *
 * A pointer move therefore costs one pick: the registered meshes drawn into a window of one
 * device pixel (the pointer's), and an asynchronous read of that pixel. Every trace of the globe
 * reads the same pick.
 *
 * ## Pickers
 *
 * A render root has one picker for its globes, made on first use and kept in a module `WeakMap`;
 * it is disposed when the last globe of the root lets go of it ({@link GlobePicking.release}),
 * and a globe that lets go frees its viewport's pick target. The 3D scenes of `traces-3d` keep a
 * picker of their own for the same root. The two do not meet: a picker holds one GPU picker per
 * **viewport**, with its own render target, proxies and ids, and a globe's viewport is never a
 * scene's (the interaction suite hovers a scene and a globe in one figure).
 *
 * This module is part of the globe's lazy code: only the globe views of the traces import it. It
 * imports nothing of the package's initial code (`globeScene` is handed to {@link globePicking}),
 * so that a bundler makes no chunk for what the two would share (ADR-026).
 */
import {
  type createPicker,
  type PickerHost,
  type PickResult,
  type PickTarget,
  type Viewport,
} from '@mk7s/holochart-render';
import { createLatestQueue, type Chart, type LatestQueue } from '@mk7s/holochart-runtime';
import type { Object3D } from 'three';
import type { GlobeScene } from './globe-scene.ts';

/** How long the globe must rest before a label hidden by its motion comes back, ms. */
export const REST_MS = 150;

/** `globeScene` of `globe-scene.ts`: the globe of a viewport. */
export type GlobeSceneOf = (viewport: Viewport) => GlobeScene;

/** The part of render's `Picker` this module uses (a fake stands in for it in unit tests). */
export interface GlobePicker {
  add(
    viewport: Viewport,
    target: PickTarget,
    options?: { traceIndex?: number; occludeOnly?: boolean },
  ): number;
  remove(id: number): boolean;
  pickIn(
    viewport: Viewport,
    x: number,
    y: number,
    options?: { radius?: number; mode?: 'closest' | 'all' },
  ): Promise<PickResult[]>;
  clearViewport?(viewport: Viewport): void;
  dispose(): void;
}

/** Makes the picker of a render root. */
export type GlobePickerFactory = (root: object) => GlobePicker;

interface RootPicker {
  readonly picker: GlobePicker;
  /** The globes (viewports) that pick with it. */
  users: number;
}

/** One picker per render root, shared by the root's globes. */
const PICKERS = new WeakMap<object, RootPicker>();

/**
 * Render's `createPicker`, handed over by the trace that loads this code ({@link provideGlobePicker}):
 * it comes from render's lazy picker chunk (`loadPicker`), so that a map without a globe does not
 * carry the pickers in its initial code.
 */
let create: typeof createPicker | undefined;

/** Hand this module render's `createPicker`. The trace does it before it creates a globe view. */
export function provideGlobePicker(createFn: typeof createPicker): void {
  create = createFn;
}

const renderPicker: GlobePickerFactory = (root) => {
  if (!create) throw new Error("The globe's picker was not loaded by its trace (loadPicker).");
  return create(root as PickerHost);
};

let factory: GlobePickerFactory = renderPicker;

/**
 * Replace what makes a root's picker, and return what it was. For unit tests, which have no
 * WebGL context to pick in.
 * @internal
 */
export function setGlobePickerFactory(next: GlobePickerFactory | undefined): GlobePickerFactory {
  const before = factory;
  factory = next ?? renderPicker;
  return before;
}

/** Whether render root `root` has a globe picker now (tests: nothing is left behind). */
export function hasGlobePicker(root: object): boolean {
  return PICKERS.has(root);
}

interface Registration {
  /** What hits of this target carry as `traceIndex`. */
  readonly key: number;
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

/** The render root of a chart; `undefined` for a stand-in chart of a hand-built context. */
function rootOf(chart: Chart | undefined): object | undefined {
  return (chart as { three?: { root?: object } } | undefined)?.three?.root;
}

/** The pick state of one globe (see the module comment). */
export class GlobePicking {
  readonly viewport: Viewport;
  readonly #sceneOf: GlobeSceneOf;
  /** Bumped whenever what is drawn where changes: older pick results are dropped. */
  version = 0;
  #chart: Chart | undefined;
  #root: object | undefined;
  #picker: GlobePicker | undefined;
  readonly #targets = new Map<PickTarget, Registration>();
  #nextKey = 1;
  /** The globe's body as it is registered, and its handle. */
  #body: Object3D | undefined;
  #bodyHandle: number | undefined;
  /** `GlobeScene.version` as of the last look. */
  #placed: number;
  #queue: LatestQueue<PickRequest> | undefined;
  #requested: PickRequest | undefined;
  #result: PickState | undefined;
  /** The latest ask got hits (a label may be up). */
  #shown = false;
  /** A label was up when the globe moved: bring it back when the globe rests. */
  #resume = false;
  #rest: ReturnType<typeof setTimeout> | undefined;
  /** The trace views that use this state. */
  #users = 0;

  constructor(viewport: Viewport, sceneOf: GlobeSceneOf) {
    this.viewport = viewport;
    this.#sceneOf = sceneOf;
    this.#placed = sceneOf(viewport).version;
  }

  /** A view starts using the state. Pair with {@link release}. */
  acquire(): this {
    this.#users++;
    return this;
  }

  /**
   * A view is done with the state. The last one out stops the picks, takes every registration
   * back and lets go of the root's picker, which is disposed when no globe of the root uses it.
   */
  release(): void {
    if (this.#users > 0) this.#users--;
    if (this.#users > 0) return;
    clearTimeout(this.#rest);
    this.#rest = undefined;
    this.#resume = false;
    this.#shown = false;
    this.#queue?.dispose();
    this.#queue = undefined;
    this.#requested = undefined;
    this.#result = undefined;
    this.#detach();
    this.#targets.clear();
    this.#chart = undefined;
    STATES.delete(this.viewport);
  }

  /**
   * Pick with the picker of `chart`'s render root from now on. Called by the views on every
   * draw: a chart is the same from pass to pass, and a stand-in chart without a render root (a
   * hand-built context) leaves the state without a picker, so nothing is hit.
   */
  attach(chart: Chart | undefined): void {
    this.#chart = chart;
    const root = rootOf(chart);
    if (root === this.#root) return;
    this.#detach();
    if (!root) return;
    let shared = PICKERS.get(root);
    if (!shared) PICKERS.set(root, (shared = { picker: factory(root), users: 0 }));
    shared.users++;
    this.#root = root;
    this.#picker = shared.picker;
    for (const [target, reg] of this.#targets) reg.handle = this.#add(target, reg.key, false);
    this.#syncBody();
  }

  /**
   * Make `target` (a pickable primitive such as a mesh) pickable. Returns its key: the
   * `traceIndex` of its hits. Registering it again gives the same key.
   */
  register(target: PickTarget): number {
    let reg = this.#targets.get(target);
    if (!reg) {
      reg = { key: this.#nextKey++, handle: undefined };
      this.#targets.set(target, reg);
      reg.handle = this.#add(target, reg.key, false);
      this.changed();
    }
    return reg.key;
  }

  unregister(target: PickTarget): void {
    const reg = this.#targets.get(target);
    if (!reg) return;
    this.#targets.delete(target);
    if (reg.handle !== undefined) this.#picker?.remove(reg.handle);
    this.changed();
  }

  /**
   * What is drawn changed (data, style, layout), or the globe may have moved: results picked
   * before are stale. With `drawn` false only a move of the globe counts (the subplot's change
   * notification also follows a gesture that moved nothing).
   */
  changed(drawn = true): void {
    const placed = this.#sceneOf(this.viewport).version;
    if (!drawn && placed === this.#placed) return;
    this.#placed = placed;
    this.version++;
    if (this.#shown) {
      // Hover again now: the label hides (its pick is of the old view) until the globe rests.
      this.#shown = false;
      this.#resume = true;
      this.#refresh();
    }
    if (!this.#resume) return;
    clearTimeout(this.#rest);
    this.#rest = setTimeout(() => {
      this.#rest = undefined;
      this.#resume = false;
      this.#refresh();
    }, REST_MS);
  }

  /**
   * What is drawn at container point `(cx, cy)`, nearest first, as of the latest pick of the
   * current view (see the module comment): empty until one has resolved. Starts a pick when none
   * is running or done for this position and view.
   */
  hits(cx: number, cy: number): readonly PickResult[] {
    // A move nobody announced (the globe is placed by the subplot before it notifies).
    if (this.#sceneOf(this.viewport).version !== this.#placed) this.changed(false);
    // While the globe moves, nothing is picked: the label comes back when it rests.
    if (this.#rest !== undefined) return NONE;
    this.#syncBody();
    const r = this.#result;
    const current = r !== undefined && r.version === this.version;
    if (!current || r.cx !== cx || r.cy !== cy) this.#request(cx, cy);
    const hits = current ? r.hits : NONE;
    this.#shown = hits.length > 0;
    return hits;
  }

  #refresh(): void {
    try {
      this.#chart?.refreshHover();
    } catch {
      // A chart destroyed meanwhile has no hover to run.
    }
  }

  #add(target: PickTarget, key: number, occludeOnly: boolean): number | undefined {
    if (!this.#picker) return undefined;
    try {
      return this.#picker.add(this.viewport, target, {
        traceIndex: key,
        ...(occludeOnly ? { occludeOnly: true } : {}),
      });
    } catch {
      // The picker went with its chart's renderer: no picking until a new one is attached.
      this.#drop();
      return undefined;
    }
  }

  /** Register the globe's body as an occluder, once it is drawn, and follow it when it changes. */
  #syncBody(): void {
    if (!this.#picker) return;
    const body = this.#sceneOf(this.viewport).body;
    if (body === this.#body) return;
    if (this.#bodyHandle !== undefined) this.#picker.remove(this.#bodyHandle);
    this.#body = body;
    this.#bodyHandle = body ? this.#add(body, 0, true) : undefined;
    // What was picked without the occluder may be behind it.
    this.version++;
  }

  /** Take the registrations back and let go of the root's picker. */
  #detach(): void {
    const picker = this.#picker;
    const root = this.#root;
    if (picker) {
      for (const reg of this.#targets.values()) {
        if (reg.handle !== undefined) picker.remove(reg.handle);
        reg.handle = undefined;
      }
      if (this.#bodyHandle !== undefined) picker.remove(this.#bodyHandle);
      // The viewport's GPU picker (its render target and proxies) goes with its last target.
      picker.clearViewport?.(this.viewport);
    }
    this.#drop();
    const shared = root ? PICKERS.get(root) : undefined;
    if (root && shared && shared.picker === picker && --shared.users <= 0) {
      PICKERS.delete(root);
      shared.picker.dispose();
    }
  }

  #drop(): void {
    this.#picker = undefined;
    this.#root = undefined;
    this.#body = undefined;
    this.#bodyHandle = undefined;
    for (const reg of this.#targets.values()) reg.handle = undefined;
  }

  #request(cx: number, cy: number): void {
    const q = this.#requested;
    if (q && q.cx === cx && q.cy === cy && q.version === this.version) return;
    if (!this.#picker) return;
    const request: PickRequest = { cx, cy, version: this.version };
    this.#requested = request;
    this.#queue ??= createLatestQueue(
      (req: PickRequest) =>
        this.#picker
          ? // The pixel under the pointer: a region is hit where it is drawn, not near it.
            this.#picker.pickIn(this.viewport, req.cx, req.cy, { radius: 0, mode: 'closest' })
          : Promise.resolve([]),
      (hits: PickResult[], req: PickRequest) => this.#deliver(hits, req),
    );
    this.#queue.push(request);
  }

  #deliver(hits: readonly PickResult[], req: PickRequest): void {
    if (req.version !== this.version) {
      // The view changed while picking: hover asks again for the current one.
      if (this.#requested === req) this.#requested = undefined;
      if (this.#rest === undefined) this.#refresh();
      return;
    }
    this.#result = { ...req, hits };
    this.#refresh();
  }
}

const STATES = new WeakMap<Viewport, GlobePicking>();

/**
 * The pick state of the globe drawn in `viewport` (made on first use). `sceneOf` is `globeScene`
 * of `globe-scene.ts`, handed over by the caller (see the module comment).
 */
export function globePicking(viewport: Viewport, sceneOf: GlobeSceneOf): GlobePicking {
  let state = STATES.get(viewport);
  if (!state) STATES.set(viewport, (state = new GlobePicking(viewport, sceneOf)));
  return state;
}
