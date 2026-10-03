/**
 * The live scene (plan E14.1a): one per chart and scene id, shared by the scene component and the
 * scene's trace views. It owns nothing the runtime doesn't: the viewport comes from the runtime's
 * `subplotViewport` hook, the layout from {@link sceneCrossTraceLayout}. It holds the camera (the
 * layout's, until the user moves it) and maps between linear, scene (world) and screen
 * coordinates. See the module comment of `index.ts` for the contract 3D traces build on.
 */
import { isPlainObject, toRGBA, type FullLayout } from '@mk7s/holochart-core';
import type { DataTransform, Viewport, ViewportRect } from '@mk7s/holochart-render';
import { domainRect, type SubplotViewportOptions } from '@mk7s/holochart-runtime';
import { Vector3 } from 'three';
import {
  cameraOf,
  sceneCameraPayload,
  copyCamera,
  sameCamera,
  type SceneProjection,
  type SceneCamera,
  type Vec3,
} from './camera.ts';
import { buildSceneLayout, laidOutScene, type SceneLayout } from './layout.ts';
import { sceneOf } from './layout-defaults.ts';
import { SceneLighting, type LightRigUser } from './scene-lighting.ts';

type Container = Record<string, unknown>;

/**
 * What {@link acquireScene} needs: a trace's plot context or a component's draw context.
 * @experimental
 */
export interface SceneContext {
  readonly fullLayout: FullLayout;
  readonly plotArea?: Readonly<ViewportRect> | undefined;
  subplotViewport?(key: string, options: SubplotViewportOptions): Viewport;
}

/**
 * A point on screen: container px (top-left origin) and NDC depth (−1 near … 1 far).
 * @experimental
 */
export interface ScreenPoint {
  x: number;
  y: number;
  depth: number;
}

const tmp = new Vector3();

/** The live scene (see the module comment). Get it with {@link acquireScene}. @experimental */
export class Scene3D {
  readonly id: string;
  readonly viewport: Viewport;
  /** The scene as laid out by the latest pass that laid it out. */
  layout: SceneLayout;
  /** The camera in use (scene units); the controls move it, the layout's `camera` resets it. */
  camera: SceneCamera;
  /** `camera.projection.type` in use. */
  projection: SceneProjection = 'perspective';
  /**
   * Orthographic zoom not committed yet: Plotly zooms orthographic scenes by scaling their
   * `aspectratio`, which the controls commit when the gesture ends; until then the view zooms.
   */
  orthoZoom = 1;
  /** The camera and aspect ratio of the first drawn view (double-click, "reset to last save"). */
  readonly initial: { camera: SceneCamera; aspect: Vec3; aspectmode: unknown };
  #layoutCamera: SceneCamera;
  /** The camera the controls last committed, until a pass applies it. */
  #committed: SceneCamera | undefined;
  #fullLayout: FullLayout | undefined;
  /** An orthographic zoom committed as an aspect ratio, waiting for its layout. */
  #committedZoom = 1;
  readonly #listeners = new Set<(scene: Scene3D) => void>();
  /** The scene's lights (`layout.sceneN.lighting`, E8.7; see `scene-lighting.ts`). */
  readonly lighting: SceneLighting = new SceneLighting(this);

  constructor(id: string, viewport: Viewport, layout: SceneLayout, full: Container) {
    this.id = id;
    this.viewport = viewport;
    this.layout = layout;
    this.#layoutCamera = cameraOf(full['camera']);
    this.camera = copyCamera(this.#layoutCamera);
    this.initial = {
      camera: copyCamera(this.#layoutCamera),
      aspect: [...layout.aspect],
      aspectmode: full['aspectmode'],
    };
  }

  /** Linear coordinates → scene units (all three axes; see `SceneLayout.transform`). */
  get transform(): Required<DataTransform> {
    return this.layout.transform;
  }

  /**
   * Take a pass's layout: a camera the layout changed replaces the live one (an app's relayout,
   * a reset, or the controls' own commit, which then changes nothing).
   */
  apply(fullLayout: FullLayout, layout: SceneLayout | undefined): void {
    if (fullLayout === this.#fullLayout && (!layout || layout === this.layout)) return;
    this.#fullLayout = fullLayout;
    const full = fullLayout[this.id] as Container;
    if (layout && layout !== this.layout) {
      this.layout = layout;
      if (this.#committedZoom !== 1) {
        this.orthoZoom /= this.#committedZoom;
        this.#committedZoom = 1;
      }
    }
    // The ratio in use and the ranges belong in every full layout (Plotly writes them back).
    const a = this.layout.aspect;
    full['aspectratio'] = { x: a[0], y: a[1], z: a[2] };
    const camera = (full['camera'] ?? {}) as Container;
    const projection: SceneProjection =
      (camera['projection'] as Container | undefined)?.['type'] === 'orthographic'
        ? 'orthographic'
        : 'perspective';
    if (projection !== this.projection) {
      this.projection = projection;
      this.orthoZoom = 1;
    }
    const cam = cameraOf(full['camera']);
    if (!sameCamera(cam, this.#layoutCamera)) {
      this.#layoutCamera = cam;
      // The controls' own commit leaves the live camera alone: it may have moved on since.
      const own = this.#committed && sameCamera(cam, this.#committed);
      if (!own) this.camera = copyCamera(cam);
      this.#committed = undefined;
    }
    this.sync();
  }

  /** Move the camera (controls, animations): the view follows on the next frame. */
  setCamera(camera: SceneCamera): void {
    this.camera = camera;
    this.sync();
  }

  /** Commit an orthographic zoom as an aspect ratio (see {@link orthoZoom}). */
  commitZoom(): Record<string, unknown> {
    const s = this.orthoZoom;
    this.#committedZoom = s;
    const a = this.layout.aspect;
    return { x: a[0] * s, y: a[1] * s, z: a[2] * s };
  }

  /**
   * The `scene.camera` of a relayout for the live camera. With `commit`, the layout camera it
   * becomes will not replace the live one (see {@link apply}).
   */
  cameraPayload(commit = false): Record<string, unknown> {
    if (commit) this.#committed = copyCamera(this.camera);
    return sceneCameraPayload(this.camera, this.projection);
  }

  /**
   * Light a mesh primitive with the scene's lights (`scene.lighting`, E8.7): now and whenever they
   * change. Returns the function that stops it (call it when the mesh is disposed).
   */
  useLightRig(mesh: LightRigUser): () => void {
    return this.lighting.use(mesh);
  }

  /** Called with this scene whenever the camera moved (the axes redraw, views may re-sort). */
  onCameraChange(listener: (scene: Scene3D) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Push the camera to the viewport's three.js camera and tell the listeners. */
  sync(): void {
    const cam = this.viewport.camera;
    const c = this.camera;
    cam.up.set(c.up[0], c.up[1], c.up[2]);
    cam.position.set(c.eye[0], c.eye[1], c.eye[2]);
    cam.lookAt(c.center[0], c.center[1], c.center[2]);
    const zoom = this.projection === 'orthographic' ? this.orthoZoom : 1;
    if (cam.zoom !== zoom) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    for (const l of this.#listeners) l(this);
  }

  /** Linear coordinates → scene units. */
  toWorld(x: number, y: number, z: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const t = this.layout.transform;
    out[0] = x * t.scaleX + t.offsetX;
    out[1] = y * t.scaleY + t.offsetY;
    out[2] = z * t.scaleZ + t.offsetZ;
    return out;
  }

  /**
   * Scene units → screen: container px (top-left origin) and NDC depth. Uses the camera as of
   * the last {@link sync}.
   */
  project(
    x: number,
    y: number,
    z: number,
    out: ScreenPoint = { x: 0, y: 0, depth: 0 },
  ): ScreenPoint {
    const r = this.viewport.rect;
    tmp.set(x, y, z).project(this.viewport.camera);
    out.x = r.x + ((tmp.x + 1) / 2) * r.width;
    out.y = r.y + ((1 - tmp.y) / 2) * r.height;
    out.depth = tmp.z;
    return out;
  }
}

/** Live scenes by viewport (one viewport per chart and scene id). */
const SCENES = new WeakMap<Viewport, Scene3D>();
/** Live scenes by the full layout of the pass that last acquired them (hover, `sceneFor`). */
const BY_LAYOUT = new WeakMap<FullLayout, Map<string, Scene3D>>();

/**
 * The live scene `id` for this pass: its viewport (created on first use), updated with `layout`
 * (a trace passes its `calc.scene`; else the pass's laid-out scene, or the previous layout, or one
 * laid out without data). `undefined` when the scene isn't in the layout or the context has no
 * `subplotViewport` (hand-built contexts).
 * @experimental
 */
export function acquireScene(
  ctx: SceneContext,
  id: string,
  layout?: SceneLayout,
): Scene3D | undefined {
  const full = ctx.fullLayout[id];
  if (!isPlainObject(full) || !ctx.subplotViewport) return undefined;
  const area = ctx.plotArea ?? { x: 0, y: 0, width: 1, height: 1 };
  let laid = layout ?? laidOutScene(ctx.fullLayout, id);
  const camera = (full['camera'] ?? {}) as Container;
  const projection =
    (camera['projection'] as Container | undefined)?.['type'] === 'orthographic'
      ? 'orthographic'
      : 'perspective';
  const bg = toRGBA(String(full['bgcolor']));
  const d = (full['domain'] ?? {}) as Container;
  const extent = (v: unknown): [number, number] =>
    Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
      ? [v[0], v[1]]
      : [0, 1];
  const viewport = ctx.subplotViewport(id, {
    rect: domainRect(area, extent(d['x']), extent(d['y'])),
    projection,
    background: bg && bg[3] > 0 ? bg : null,
  });
  let scene = SCENES.get(viewport);
  if (!scene) {
    const first = laid ?? buildSceneLayout(ctx.fullLayout, id, area, []);
    if (!first) return undefined;
    scene = new Scene3D(id, viewport, first, full);
    SCENES.set(viewport, scene);
    laid = first;
  }
  scene.apply(ctx.fullLayout, laid);
  let map = BY_LAYOUT.get(ctx.fullLayout);
  if (!map) BY_LAYOUT.set(ctx.fullLayout, (map = new Map()));
  map.set(id, scene);
  return scene;
}

/**
 * The live scene of a 3D trace in the pass of `fullLayout` (hover and picking: `hoverPoints`
 * gets the full layout of the pass), once the trace's view or the component acquired it.
 * @experimental
 */
export function sceneFor(
  fullLayout: FullLayout,
  trace: Readonly<Record<string, unknown>>,
): Scene3D | undefined {
  return BY_LAYOUT.get(fullLayout)?.get(sceneOf(trace));
}
