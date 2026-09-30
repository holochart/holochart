/**
 * The scene component (plan E14.1a–c): declares `layout.scene*`, supplies the scene defaults,
 * draws every scene's axes (`draw.ts`) and runs the 3D controls, after plotly.js `gl3d/scene.js`
 * and gl-plot3d's camera controls:
 *
 * - **Drag** in a scene (`scene.dragmode`): `orbit` rotates freely, `turntable` about the z axis
 *   (z stays up), `zoom` dollies (drag down to zoom in), `pan` slides the view. Shift rotates,
 *   Ctrl / ⌘ pans and Alt zooms whatever the mode (gl-plot3d's modifiers).
 * - **Wheel** zooms when `config.scrollZoom` allows `scene` (the default).
 * - **Touch**: one finger drags as above; two fingers pinch-zoom and pan.
 * - **Double-click** goes back to the first drawn view (unless `config.doubleClick` is `false`).
 *
 * Input moves the camera through damping (`controls.ts`): frames render only while it moves.
 * Every frame of a gesture emits `relayouting` with `scene.camera`; when the camera comes to
 * rest after the gesture, one GUI `relayout` commits it (Plotly's payload: `'scene.camera'`, and
 * `'scene.aspectratio'` / `'scene.aspectmode': 'manual'` after an orthographic zoom).
 */
import { reducedMotion, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type {
  ComponentDrawContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentView,
} from '@mk7s/holochart-runtime';
import {
  addMotion,
  applyMotion,
  DAMPING_MS,
  dampedStep,
  dragMotion,
  emptyMotion,
  settled,
  WHEEL_ZOOM,
  type Motion,
} from './controls.ts';
import { sceneCameraPayload, sameCamera } from './camera.ts';
import { SceneAxes } from './draw.ts';
import { sceneLayoutSchema } from './layout-attributes.ts';
import { isSceneTrace, sceneIds, sceneOf, supplySceneLayoutDefaults } from './layout-defaults.ts';
import { buildSceneLayout, laidOutScene, type SceneCalc, type SceneLayout } from './layout.ts';
import { sceneModebarButtons } from './modebar.ts';
import { acquireScene, type Scene3D } from './scene.ts';

type Container = Record<string, unknown>;

/** A wheel zoom counts as one gesture until the wheel rests this long (ms). */
const WHEEL_REST = 200;

/** The scene's layout for this pass (see `acquireScene`): laid out, a trace's, or without data. */
function resolveLayout(ctx: ComponentDrawContext, id: string): SceneLayout | undefined {
  const laid = laidOutScene(ctx.fullLayout, id);
  if (laid) return laid;
  const data = ctx.fullData;
  for (let i = 0; i < data.length; i++) {
    const t = data[i] as FullTrace;
    if (t.visible !== true || !isSceneTrace(t) || sceneOf(t) !== id) continue;
    const scene = (ctx.calcdata?.(i) as SceneCalc | undefined)?.scene;
    if (scene) return scene;
  }
  return buildSceneLayout(ctx.fullLayout, id, ctx.plotArea, []);
}

/** A scene whose camera is moving (input pending or a gesture in progress). */
interface Moving {
  readonly pending: Motion;
  rotation: 'orbit' | 'turntable';
  /** A gesture holds it: no commit yet. */
  active: boolean;
  /** The camera moved since the gesture started (else nothing to commit). */
  moved: boolean;
}

interface Gesture {
  readonly scene: Scene3D;
  readonly mode: 'rotate' | 'pan' | 'zoom';
  x: number;
  y: number;
}

class SceneView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #axes = new Map<string, SceneAxes>();
  #scenes: Scene3D[] = [];
  readonly #moving = new Map<Scene3D, Moving>();
  #gesture: Gesture | undefined;
  #release: (() => void) | undefined;
  #wheelTimer: ReturnType<typeof setTimeout> | undefined;
  /** Touch: every finger on the canvas during a touch gesture (container px). */
  readonly #touches = new Map<number, { x: number; y: number }>();
  #touchEnd: (() => void) | undefined;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  #draw(ctx: ComponentDrawContext): void {
    const scenes: Scene3D[] = [];
    const next = new Map<string, SceneAxes>();
    for (const id of sceneIds(ctx.fullLayout)) {
      const scene = acquireScene(ctx, id, resolveLayout(ctx, id));
      if (!scene) continue;
      scenes.push(scene);
      let axes = this.#axes.get(id);
      if (axes && axes.scene !== scene) {
        axes.dispose();
        axes = undefined;
      }
      if (axes) axes.update(ctx);
      else (axes = new SceneAxes(ctx, scene)).redraw();
      next.set(id, axes);
    }
    for (const [id, axes] of this.#axes) if (!next.has(id)) axes.dispose();
    this.#axes.clear();
    for (const [id, axes] of next) this.#axes.set(id, axes);
    this.#scenes = scenes;
    for (const s of this.#moving.keys()) if (!scenes.includes(s)) this.#moving.delete(s);
  }

  #sceneAt(x: number, y: number): Scene3D | undefined {
    for (let i = this.#scenes.length - 1; i >= 0; i--) {
      const s = this.#scenes[i]!;
      if (s.viewport.contains(x, y)) return s;
    }
    return undefined;
  }

  #full(scene: Scene3D): Container {
    return ((this.#ctx.fullLayout as FullLayout)[scene.id] ?? {}) as Container;
  }

  // ---- pointer ------------------------------------------------------------------------------------

  handlePointer(event: ComponentPointerEvent): boolean {
    const chart = this.#ctx.chart;
    if (!chart || this.#scenes.length === 0 || chart.interaction.staticPlot) return false;
    if (event.type === 'dblclick') {
      const scene = this.#sceneAt(event.x, event.y);
      if (!scene || this.#ctx.fullConfig?.doubleClick === false) return false;
      this.#reset(scene);
      chart.emit('doubleclick', undefined);
      return true;
    }
    const g = this.#gesture;
    if (g) {
      if (this.#touchEnd) return true;
      if (event.type === 'move') {
        this.#input(
          g.scene,
          dragMotion(g.mode, event.x - g.x, event.y - g.y, g.scene.viewport.rect.height),
        );
        g.x = event.x;
        g.y = event.y;
      } else if (event.type === 'up' || event.type === 'leave') {
        this.#endGesture();
      }
      return true;
    }
    const scene = this.#sceneAt(event.x, event.y);
    if (!scene) return false;
    const dragmode = this.#full(scene)['dragmode'];
    if (event.type === 'down' && event.button === 0 && dragmode !== false) {
      const mode = event.shiftKey
        ? 'rotate'
        : event.ctrlKey || event.metaKey
          ? 'pan'
          : event.altKey
            ? 'zoom'
            : dragmode === 'zoom' || dragmode === 'pan'
              ? dragmode
              : 'rotate';
      this.#gesture = { scene, mode, x: event.x, y: event.y };
      this.#hold(scene).active = true;
      const native = event.native as PointerEvent | undefined;
      if (native?.pointerType === 'touch') this.#startTouch(native, event.x, event.y);
      return true;
    }
    if (event.type === 'wheel') return this.#wheel(scene, event.native as WheelEvent | undefined);
    return false;
  }

  /** The motion state of a scene, created with the scene's rotation kind. */
  #hold(scene: Scene3D): Moving {
    let m = this.#moving.get(scene);
    if (!m)
      this.#moving.set(
        scene,
        (m = { pending: emptyMotion(), rotation: 'turntable', active: false, moved: false }),
      );
    m.rotation = this.#full(scene)['dragmode'] === 'orbit' ? 'orbit' : 'turntable';
    return m;
  }

  #input(scene: Scene3D, motion: Partial<Motion>): void {
    addMotion(this.#hold(scene).pending, motion);
    this.#run();
  }

  #endGesture(): void {
    const g = this.#gesture;
    this.#gesture = undefined;
    this.#touchEnd?.();
    const m = g && this.#moving.get(g.scene);
    if (m) m.active = false;
    this.#run();
  }

  #wheel(scene: Scene3D, e: WheelEvent | undefined): boolean {
    const zoom = this.#ctx.fullConfig?.scrollZoom;
    const on = zoom === true || (typeof zoom === 'string' && zoom.split('+').includes('scene'));
    if (!on || !e) return false;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
    const m = this.#hold(scene);
    m.active = true;
    this.#input(scene, { zoom: dy * WHEEL_ZOOM });
    clearTimeout(this.#wheelTimer);
    this.#wheelTimer = setTimeout(() => {
      m.active = false;
      this.#run();
    }, WHEEL_REST);
    return true;
  }

  // ---- touch --------------------------------------------------------------------------------------

  /** Follow every finger on the canvas until they all lift (the runtime routes only the first). */
  #startTouch(first: PointerEvent, x: number, y: number): void {
    const target = first.target as HTMLElement | null;
    if (!target) return;
    this.#touches.clear();
    this.#touches.set(first.pointerId, { x, y });
    const offX = first.clientX - x;
    const offY = first.clientY - y;
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType === 'touch')
        this.#touches.set(e.pointerId, { x: e.clientX - offX, y: e.clientY - offY });
    };
    const onMove = (e: PointerEvent): void => {
      const prev = this.#touches.get(e.pointerId);
      const g = this.#gesture;
      if (!prev || !g) return;
      const nx = e.clientX - offX;
      const ny = e.clientY - offY;
      const h = g.scene.viewport.rect.height;
      if (this.#touches.size === 1) {
        this.#input(g.scene, dragMotion(g.mode, nx - prev.x, ny - prev.y, h));
      } else {
        // Two fingers: pinch zoom about their distance, pan with their midpoint.
        const [a, b] = [...this.#touches.entries()];
        const other = a![0] === e.pointerId ? b![1] : a![1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(nx - other.x, ny - other.y);
        this.#input(g.scene, {
          zoom: Math.log(Math.max(1, d0) / Math.max(1, d1)),
          px: (nx - prev.x) / 2,
          py: (ny - prev.y) / 2,
        });
      }
      prev.x = nx;
      prev.y = ny;
    };
    const onUp = (e: PointerEvent): void => {
      this.#touches.delete(e.pointerId);
      if (this.#touches.size === 0) this.#endGesture();
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    this.#touchEnd = () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      this.#touchEnd = undefined;
      this.#touches.clear();
    };
  }

  // ---- motion -------------------------------------------------------------------------------------

  /** Render frames while something moves (the render loop's continuous mode). */
  #run(): void {
    const root = this.#ctx.chart?.three.root;
    if (!root || this.#release) {
      root?.invalidate();
      return;
    }
    const release = root.requestAnimation();
    const off = root.on('beforerender', (info) => this.#frame(info.delta || 16));
    this.#release = () => {
      release();
      off();
      this.#release = undefined;
    };
  }

  #frame(dt: number): void {
    const ctx = this.#ctx;
    const chart = ctx.chart;
    const tau = reducedMotion(ctx.fullLayout) ? 0 : DAMPING_MS;
    for (const [scene, m] of this.#moving) {
      const step = dampedStep(m.pending, dt, tau);
      if (!settled(step)) {
        const next = applyMotion(
          scene,
          step,
          m.rotation,
          scene.projection,
          scene.viewport.rect.height,
        );
        scene.orthoZoom = next.orthoZoom;
        scene.setCamera(next.camera);
        m.moved = true;
        chart?.emit('relayouting', this.#update(scene, false));
      }
      if (!m.active && settled(m.pending)) {
        this.#moving.delete(scene);
        if (m.moved) this.#commit(scene);
      }
    }
    if (this.#moving.size === 0) this.#release?.();
  }

  /** The relayout of a scene's view (Plotly's keys). */
  #update(scene: Scene3D, commit: boolean): Record<string, unknown> {
    const update: Record<string, unknown> = {
      [`${scene.id}.camera`]: scene.cameraPayload(commit),
    };
    if (scene.orthoZoom !== 1) {
      const a = scene.layout.aspect;
      const s = scene.orthoZoom;
      update[`${scene.id}.aspectratio`] = commit
        ? scene.commitZoom()
        : { x: a[0] * s, y: a[1] * s, z: a[2] * s };
      update[`${scene.id}.aspectmode`] = 'manual';
    }
    return update;
  }

  #commit(scene: Scene3D): void {
    const chart = this.#ctx.chart;
    if (!chart || this.#ctx.fullConfig?.staticPlot === true) return;
    chart.relayout(this.#update(scene, true), { gui: true }).catch(() => undefined);
  }

  /** Back to the first drawn view (double-click). */
  #reset(scene: Scene3D): void {
    const chart = this.#ctx.chart;
    if (!chart) return;
    this.#moving.delete(scene);
    const { camera, aspect, aspectmode } = scene.initial;
    const update: Record<string, unknown> = {};
    if (!sameCamera(camera, scene.camera)) {
      update[`${scene.id}.camera`] = sceneCameraPayload(camera, scene.projection);
    }
    const a = scene.layout.aspect;
    if (scene.orthoZoom !== 1 || aspect.some((v, i) => Math.abs(v - a[i]!) > 1e-12)) {
      scene.orthoZoom = 1;
      update[`${scene.id}.aspectratio`] = { x: aspect[0], y: aspect[1], z: aspect[2] };
      update[`${scene.id}.aspectmode`] = aspectmode;
    }
    if (Object.keys(update).length > 0)
      chart.relayout(update, { gui: true }).catch(() => undefined);
  }

  dispose(): void {
    this.#touchEnd?.();
    clearTimeout(this.#wheelTimer);
    this.#release?.();
    for (const axes of this.#axes.values()) axes.dispose();
    this.#axes.clear();
    this.#moving.clear();
  }
}

/**
 * The scene component: `layout.scene*` attributes and defaults, axes drawing and 3D controls (see
 * the module comment). `traces3d` includes it; register it with 3D traces in partial bundles.
 */
export const sceneComponent: ComponentModule = {
  name: 'scene',
  // Under the other components (the legend, titles), like the cartesian and polar axes.
  order: -10,
  layoutSchema: sceneLayoutSchema,
  supplyLayoutDefaults(layoutIn, layoutOut, ctx) {
    supplySceneLayoutDefaults(layoutIn, layoutOut, ctx);
    if (sceneIds(layoutOut).length > 0) layoutOut['_modebarButtons'] = sceneModebarButtons;
  },
  draw: {
    create: (ctx) => new SceneView(ctx),
  },
};
