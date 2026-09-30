/**
 * Camera animation and auto-rotation of the live scenes (plan E7.5), run by the scene component
 * next to the controls (`component.ts`), with the math of `camera-animation.ts`.
 *
 * - **Flights** (`chart.animateCamera`): the camera orbits to the target over the duration with the
 *   given easing (the runtime resolves Plotly's easing names), one frame at a time without pipeline
 *   runs; at the end one `relayout` commits `scene.camera` and the promise resolves. A drag, wheel
 *   or double-click in the scene, a camera change from the app, a camera transition or another
 *   flight interrupts it (the promise rejects with an `AnimationInterrupted` error, like
 *   `animate`). Reduced motion (or a zero duration) jumps and commits at once.
 * - **Camera transitions** (`react` with `layout.transition`, `animate` frames): the runtime's
 *   transition writes `scene.camera` on every frame; {@link SceneMotion.layoutTweens} gives it the
 *   in-between cameras (an orbit from the live camera, not a straight line). A drag during one
 *   commits the live camera, which stops the transition's camera (the rest of it carries on).
 * - **Auto-rotation** (`scene.autorotate`): the camera turns about the axis at `speed` degrees per
 *   second while the chart is on screen (an `IntersectionObserver`) and motion is allowed; it
 *   pauses while the controls move the camera, a flight or a camera transition runs, and carries on
 *   from where the camera came to rest. The layout camera doesn't follow (no `relayout` per frame):
 *   when the rotation stops (`speed: 0`, reduced motion switched on) one `relayout` commits the
 *   view. `autorotate.time` freezes it: the layout camera turned by `speed × time`.
 */
import { isPlainObject, reducedMotion, type FullLayout } from '@mk7s/holochart-core';
import type {
  CameraAnimationRun,
  CameraTarget,
  Chart,
  ComponentDrawContext,
  LayoutTween,
} from '@mk7s/holochart-runtime';
import { autorotateCamera, cameraTween, resolveCameraTarget } from './camera-animation.ts';
import { cameraOf, sameCamera, sceneCameraPayload, type SceneCamera } from './camera.ts';
import type { Scene3D } from './scene.ts';

type Container = Record<string, unknown>;

/** A running `animateCamera`. */
interface Flight {
  readonly tween: (t: number) => SceneCamera;
  readonly duration: number;
  readonly ease: (t: number) => number;
  start: number | undefined;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

/** A scene's `autorotate` in effect. */
interface Spin {
  readonly speed: number;
  readonly axis: 'x' | 'y' | 'z';
}

/** Longest step of a frame, ms (after a stall the rotation carries on, it doesn't jump). */
const MAX_STEP = 100;

function interrupted(): Error {
  const error = new Error('holochart: the camera animation was interrupted');
  error.name = 'AnimationInterrupted';
  return error;
}

/** Camera animations and auto-rotation of a chart's scenes (see the module comment). */
export class SceneMotion {
  readonly #busy: (scene: Scene3D) => boolean;
  #ctx: ComponentDrawContext | undefined;
  #scenes: readonly Scene3D[] = [];
  readonly #flights = new Map<Scene3D, Flight>();
  readonly #spins = new Map<Scene3D, Spin>();
  /** Scenes whose camera a layout transition animates. */
  readonly #tweening = new Set<Scene3D>();
  /** Scenes the user grabbed since their layout camera last changed (their commits are own). */
  readonly #grabbed = new Set<Scene3D>();
  /** Auto-rotation is held by reduced motion (the views it left are committed once). */
  #held = false;
  /** Per scene: its layout camera and `autorotate` as last seen. */
  readonly #seen = new Map<Scene3D, { camera: SceneCamera; spin: string }>();
  #release: (() => void) | undefined;
  #last = -1;
  #onScreen = true;
  #observer: IntersectionObserver | undefined;
  #query: MediaQueryList | undefined;
  #unsubscribe: (() => void) | undefined;

  /** `busy`: whether the controls are moving a scene's camera (auto-rotation pauses). */
  constructor(busy: (scene: Scene3D) => boolean) {
    this.#busy = busy;
  }

  get #chart(): Chart | undefined {
    return this.#ctx?.chart;
  }

  /** Take a draw pass: lights, layout camera changes and `autorotate` of every live scene. */
  sync(ctx: ComponentDrawContext, scenes: readonly Scene3D[]): void {
    this.#ctx = ctx;
    this.#scenes = scenes;
    this.#watch(ctx);
    for (const map of [this.#flights, this.#spins, this.#seen] as Map<Scene3D, unknown>[]) {
      for (const s of map.keys()) if (!scenes.includes(s)) map.delete(s);
    }
    for (const s of this.#grabbed) if (!scenes.includes(s)) this.#grabbed.delete(s);
    const renderer = ctx.chart?.three.renderer;
    for (const scene of scenes) {
      const full = (ctx.fullLayout[scene.id] ?? {}) as Container;
      scene.lighting.sync(full, scene.layout.aspect, renderer, () => ctx.invalidate());
      this.#syncCamera(scene, full);
    }
    this.#update();
  }

  #syncCamera(scene: Scene3D, full: Container): void {
    const camera = cameraOf(full['camera']);
    const ar = (isPlainObject(full['autorotate']) ? full['autorotate'] : {}) as Container;
    const speed = typeof ar['speed'] === 'number' && Number.isFinite(ar['speed']) ? ar['speed'] : 0;
    const axis = ar['axis'] === 'x' || ar['axis'] === 'y' ? ar['axis'] : 'z';
    const time = typeof ar['time'] === 'number' && Number.isFinite(ar['time']) ? ar['time'] : null;
    const spinKey = `${speed}|${axis}|${time}`;
    const seen = this.#seen.get(scene);
    this.#seen.set(scene, { camera, spin: spinKey });
    const cameraChanged = seen !== undefined && !sameCamera(seen.camera, camera);
    // The app moved the camera: that ends a flight (a transition's own writes end none).
    if (cameraChanged && !this.#tweening.has(scene)) this.#interrupt(scene);
    const own = cameraChanged && this.#grabbed.delete(scene);
    if (time !== null) {
      this.#stopSpin(scene, false);
      // A fixed frame: the layout camera turned by speed × time (not a view the user committed).
      if ((!seen || cameraChanged || seen.spin !== spinKey) && !own) {
        scene.setCamera(autorotateCamera(camera, axis, speed * time));
      }
      return;
    }
    if (speed === 0) this.#stopSpin(scene, true);
    else this.#spins.set(scene, { speed, axis });
  }

  /** Stop auto-rotating `scene`; with `commit`, report the view it shows. */
  #stopSpin(scene: Scene3D, commit: boolean): void {
    if (this.#spins.delete(scene) && commit) this.#report(scene);
  }

  /** Commit the view of `scene` when it isn't the layout camera (after the current pass). */
  #report(scene: Scene3D): void {
    const layout = this.#seen.get(scene)?.camera;
    if (!layout || sameCamera(layout, scene.camera)) return;
    queueMicrotask(() => {
      this.#commit(scene, true).catch(() => undefined);
    });
  }

  #commit(scene: Scene3D, gui: boolean): Promise<unknown> {
    const chart = this.#chart;
    if (!chart || chart.destroyed) return Promise.resolve();
    return chart.relayout({ [`${scene.id}.camera`]: scene.cameraPayload(true) }, { gui });
  }

  /** The user grabs the scene (drag, wheel, double-click): flights and camera transitions stop. */
  interact(scene: Scene3D): void {
    this.#grabbed.add(scene);
    this.#interrupt(scene);
    if (this.#tweening.delete(scene)) this.#commit(scene, true).catch(() => undefined);
  }

  #interrupt(scene: Scene3D): void {
    const flight = this.#flights.get(scene);
    if (!flight) return;
    this.#flights.delete(scene);
    flight.reject(interrupted());
  }

  /** `chart.animateCamera` (see the module comment); `undefined` without such a scene. */
  animateCamera(target: CameraTarget, run: CameraAnimationRun): Promise<void> | undefined {
    const scene = run.subplot ? this.#scenes.find((s) => s.id === run.subplot) : this.#scenes[0];
    const ctx = this.#ctx;
    if (!scene || !ctx) return undefined;
    this.#interrupt(scene);
    const to = resolveCameraTarget(scene.camera, target);
    if (run.duration <= 0 || reducedMotion(ctx.fullLayout)) {
      scene.setCamera(to);
      ctx.invalidate();
      return this.#commit(scene, false).then(() => undefined);
    }
    return new Promise<void>((resolve, reject) => {
      this.#flights.set(scene, {
        tween: cameraTween(scene.camera, to),
        duration: run.duration,
        ease: run.ease,
        start: undefined,
        resolve,
        reject,
      });
      this.#update();
    });
  }

  /** In-between cameras of a layout transition (see the module comment). */
  layoutTweens(from: FullLayout, to: FullLayout): LayoutTween[] {
    const out: LayoutTween[] = [];
    for (const scene of this.#scenes) {
      const next = to[scene.id];
      if (!isPlainObject(next)) continue;
      const target = cameraOf(next['camera']);
      const before = from[scene.id];
      const was = cameraOf(isPlainObject(before) ? before['camera'] : undefined);
      if (sameCamera(was, target) || sameCamera(scene.camera, target)) continue;
      this.#interrupt(scene);
      this.#tweening.add(scene);
      const tween = cameraTween(scene.camera, target);
      const projection =
        (next['camera'] as { projection?: { type?: unknown } } | undefined)?.projection?.type ===
        'orthographic'
          ? 'orthographic'
          : 'perspective';
      out.push({
        path: `${scene.id}.camera`,
        tween: (e) => sceneCameraPayload(tween(e), projection),
      });
    }
    return out;
  }

  // ---- the frame loop ---------------------------------------------------------------------------

  /** Whether auto-rotation may run now: on screen, motion allowed. */
  #spinning(): boolean {
    return this.#spins.size > 0 && this.#onScreen && !this.#held;
  }

  /** Start or stop requesting frames as flights and auto-rotation need them. */
  #update(): void {
    const ctx = this.#ctx;
    const held =
      ctx !== undefined &&
      reducedMotion(ctx.fullLayout, ctx.chart?.element.ownerDocument.defaultView);
    if (held && !this.#held) {
      // Reduced motion: the rotation stops where it is, and reports the view it left.
      for (const scene of this.#spins.keys()) this.#report(scene);
    }
    this.#held = held;
    const run = this.#flights.size > 0 || this.#spinning();
    const root = this.#chart?.three.root;
    if (run && !this.#release && root) {
      const release = root.requestAnimation();
      const off = root.on('beforerender', (info) => this.#frame(info.time));
      this.#last = -1;
      this.#release = () => {
        release();
        off();
        this.#release = undefined;
      };
    } else if (!run) this.#release?.();
  }

  #frame(time: number): void {
    const dt = this.#last < 0 ? 0 : Math.min(MAX_STEP, Math.max(0, time - this.#last));
    this.#last = time;
    for (const [scene, flight] of this.#flights) {
      flight.start ??= time;
      const t = Math.min(1, (time - flight.start) / flight.duration);
      scene.setCamera(flight.tween(t >= 1 ? 1 : flight.ease(t)));
      if (t < 1) continue;
      this.#flights.delete(scene);
      this.#commit(scene, false).then(
        () => flight.resolve(),
        (error: unknown) => flight.reject(error as Error),
      );
    }
    if (this.#spinning()) {
      for (const [scene, spin] of this.#spins) {
        if (this.#flights.has(scene) || this.#tweening.has(scene) || this.#busy(scene)) continue;
        scene.setCamera(autorotateCamera(scene.camera, spin.axis, (spin.speed * dt) / 1000));
      }
    }
    this.#update();
  }

  /** Watch visibility, the reduced-motion preference and transitions (once). */
  #watch(ctx: ComponentDrawContext): void {
    const chart = ctx.chart;
    if (!chart || this.#unsubscribe) return;
    const clear = (): void => this.#tweening.clear();
    const offs = [chart.on('transitioned', clear), chart.on('transitioninterrupted', clear)];
    const view = chart.element.ownerDocument.defaultView;
    try {
      this.#query = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    } catch {
      this.#query = undefined;
    }
    const onChange = (): void => this.#update();
    this.#query?.addEventListener?.('change', onChange);
    const canvas = chart.three.renderer.domElement;
    if (typeof IntersectionObserver === 'function') {
      this.#observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        this.#onScreen = last.isIntersecting;
        this.#update();
      });
      try {
        this.#observer.observe(canvas);
      } catch {
        // Not an element (an `OffscreenCanvas`): taken as on screen.
      }
    }
    this.#unsubscribe = () => {
      for (const off of offs) off();
      this.#query?.removeEventListener?.('change', onChange);
      this.#observer?.disconnect();
    };
  }

  dispose(): void {
    for (const scene of [...this.#flights.keys()]) this.#interrupt(scene);
    this.#spins.clear();
    this.#release?.();
    this.#unsubscribe?.();
    for (const scene of this.#scenes) scene.lighting.dispose();
  }
}
