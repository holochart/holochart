/**
 * The 2.5D view of a 2D subplot (plan E8.9, `layout.view3d`): a {@link ViewportProjector} that
 * draws the subplot's viewport through a tilted camera (`view3d-camera.ts`) and maps pointers
 * between the screen and the plot plane. Part of render's lazily loaded 2.5D chunk.
 *
 * ## What it does to the viewport
 *
 * - **Camera**: `viewport.camera` becomes this projector's (perspective, or orthographic for
 *   `perspective: 0`), recomputed on every `layout()`.
 * - **No scissor**: the viewport renders into the whole canvas (`clip: false`), since the tilted
 *   plot area is no longer the rect.
 * - **Plot background and clipping**: the viewport's background (`plot_bgcolor`) is drawn as a
 *   quad on the plot plane instead of a scissored clear. The quad also writes a stencil value
 *   (one per projector), and every flat object of the scene draws only where it is set — so flat
 *   traces, grids and shapes are clipped to the tilted plot area exactly, the way the flat view's
 *   scissor clips them to the rect. Objects flagged `userData.hcUnclipped` (extruded prisms, which
 *   clip to the axis ranges in 3D themselves, and the labels drawn on them) are left alone.
 * - **Pointers**: {@link View3DProjector.unproject} maps a screen point to the plot plane — onto
 *   the front of an extruded shape when the ray hits one first (so hover and click pick what is
 *   drawn there), else onto z = 0; {@link View3DProjector.project} maps back.
 *
 * {@link View3DProjector.detach} undoes all of it.
 */
import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  ReplaceStencilOp,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Vector3,
} from 'three';
import type { Viewport, ViewportProjector, ViewportRect } from '../core/viewport.ts';
import type { RGBA } from '../types.ts';
import { UNCLIPPED, type ExtrusionHit } from './extrusion.ts';
import {
  view3dCamera,
  view3dProject,
  view3dRay,
  type View3DAngles,
  type View3DCamera,
} from './view3d-camera.ts';

/** Render order of the plot-area quad: under everything else in the subplot. */
const PLANE_ORDER = -1e14;

let nextRef = 0;

/** Objects with a `raycast` like the extrusion primitive's (found among the viewport's primitives). */
interface Raycastable {
  raycast(origin: Vector3, direction: Vector3): ExtrusionHit | undefined;
}

function isRaycastable(p: unknown): p is Raycastable {
  return typeof (p as Partial<Raycastable>).raycast === 'function';
}

/** See the module comment. */
export class View3DProjector implements ViewportProjector {
  readonly #perspective = new PerspectiveCamera();
  readonly #orthographic = new OrthographicCamera();
  readonly #plane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Stencil value of this projector's plot area. */
  readonly #ref: number;
  /** Materials this projector turned the stencil test on for. */
  readonly #clipped = new Set<Material>();
  #angles: View3DAngles;
  #camera: View3DCamera | null = null;
  #viewport: Viewport | null = null;
  #rect: ViewportRect = { x: 0, y: 0, width: 1, height: 1 };
  #area: ViewportRect = { x: 0, y: 0, width: 1, height: 1 };
  /** The viewport's own background, painted by the plane while attached. */
  #background: RGBA | null = null;

  constructor(angles: View3DAngles) {
    this.#angles = { ...angles };
    this.#ref = (nextRef++ % 255) + 1;
    const material = new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: this.#ref,
      stencilFunc: AlwaysStencilFunc,
      stencilFail: ReplaceStencilOp,
      stencilZFail: ReplaceStencilOp,
      stencilZPass: ReplaceStencilOp,
    });
    this.#plane = new Mesh(new PlaneGeometry(1, 1), material);
    this.#plane.renderOrder = PLANE_ORDER;
    this.#plane.frustumCulled = false;
    this.#plane.name = 'holochart:view3d-plane';
    this.#plane.userData[UNCLIPPED] = true;
    this.#plane.onBeforeRender = (_renderer, scene) => this.#clip(scene);
  }

  /** The camera the viewport draws with. */
  get camera(): PerspectiveCamera | OrthographicCamera {
    return this.#camera?.orthographic ? this.#orthographic : this.#perspective;
  }

  /** The current camera math (null before the first layout). */
  get view(): View3DCamera | null {
    return this.#camera;
  }

  get angles(): View3DAngles {
    return this.#angles;
  }

  /** The viewport drawn in 2.5D (null when detached). */
  get viewport(): Viewport | null {
    return this.#viewport;
  }

  /** Draw `viewport` in 2.5D (see the module comment). */
  attach(viewport: Viewport): void {
    if (this.#viewport === viewport) return;
    this.detach();
    this.#viewport = viewport;
    viewport.projector = this;
    viewport.scene.add(this.#plane);
    this.takeBackground();
    // Relayouts (with this projector's `layout`).
    viewport.setClip(false);
  }

  /**
   * Paint the viewport's background (e.g. set again by the chart for `plot_bgcolor`) with the
   * plot-area quad, and clear it from the viewport. Call after anything that may set it.
   */
  takeBackground(): void {
    const vp = this.#viewport;
    if (!vp) return;
    if (vp.background) this.#background = vp.background;
    vp.background = null;
    const bg = this.#background;
    const m = this.#plane.material;
    m.colorWrite = bg !== null && bg[3] > 0;
    if (bg) {
      m.color.setRGB(bg[0], bg[1], bg[2], SRGBColorSpace);
      m.opacity = bg[3];
    }
  }

  /** Draw the viewport flat again: its camera, scissor, background and materials as before. */
  detach(): void {
    const vp = this.#viewport;
    if (!vp) return;
    this.#viewport = null;
    this.#plane.removeFromParent();
    for (const m of this.#clipped) m.stencilWrite = false;
    this.#clipped.clear();
    if (vp.disposed) return;
    if (vp.background === null) vp.background = this.#background;
    if (vp.projector === this) vp.projector = null;
    vp.setClip(true);
  }

  /** Change the angles (a drag, a transition frame): recomputes the camera; request a frame. */
  setAngles(angles: View3DAngles): void {
    const a = this.#angles;
    if (
      a.tilt === angles.tilt &&
      a.rotation === angles.rotation &&
      a.perspective === angles.perspective
    ) {
      return;
    }
    this.#angles = { ...angles };
    if (this.#viewport) this.layout(this.#viewport);
  }

  layout(viewport: Viewport): void {
    this.#rect = { ...viewport.rect };
    this.#area = { ...viewport.renderArea };
    const cam = view3dCamera(this.#rect, this.#area, this.#angles);
    this.#camera = cam;
    const w = cam.window;
    const target = cam.orthographic ? this.#orthographic : this.#perspective;
    target.position.copy(cam.eye);
    target.up.set(0, 1, 0);
    target.lookAt(cam.target);
    target.near = cam.near;
    target.far = cam.far;
    target.updateMatrixWorld(true);
    target.projectionMatrix.copy(cam.projection);
    target.projectionMatrixInverse.copy(cam.projection).invert();
    if (target instanceof OrthographicCamera) {
      target.left = w[0];
      target.right = w[1];
      target.top = w[2];
      target.bottom = w[3];
    }
    const plane = this.#plane;
    plane.scale.set(this.#rect.width, this.#rect.height, 1);
    plane.position.set(this.#rect.width / 2, this.#rect.height / 2, 0);
    plane.updateMatrixWorld(true);
  }

  /** A plot-plane point (container px), raised by `z` px toward the viewer, on screen. */
  project(x: number, y: number, z = 0): [number, number] {
    const cam = this.#camera;
    const r = this.#rect;
    if (!cam) return [x, y];
    return view3dProject(cam, this.#area, x - r.x, r.y + r.height - y, z);
  }

  unproject(x: number, y: number): [number, number] {
    const cam = this.#camera;
    const r = this.#rect;
    if (!cam) return [x, y];
    const { origin, direction } = view3dRay(cam, this.#area, x, y);
    let wx = NaN;
    let wy = NaN;
    let best = Math.abs(direction.z) < 1e-12 ? Infinity : -origin.z / direction.z;
    if (Number.isFinite(best)) {
      wx = origin.x + best * direction.x;
      wy = origin.y + best * direction.y;
    }
    for (const p of this.#viewport?.primitives ?? []) {
      if (!isRaycastable(p) || !p.object.visible) continue;
      const hit = p.raycast(origin, direction);
      if (hit && hit.t < best) {
        best = hit.t;
        wx = hit.x;
        wy = hit.y;
      }
    }
    return [r.x + wx, r.y + r.height - wy];
  }

  /** Free the plane (after {@link detach}). */
  dispose(): void {
    this.detach();
    this.#plane.geometry.dispose();
    this.#plane.material.dispose();
  }

  /**
   * Stencil-test every flat object of the scene against this projector's plot area, every frame:
   * an object flagged unclipped after it was drawn clipped (labels and lines lifted onto extruded
   * shapes once their code has loaded) is released, so the result doesn't depend on load timing.
   */
  #clip(scene: Object3D): void {
    const ref = this.#ref;
    scene.traverse((o) => {
      const m = (o as Partial<Mesh>).material;
      if (!m) return;
      if (o.userData[UNCLIPPED]) {
        for (const material of Array.isArray(m) ? m : [m]) {
          if (this.#clipped.delete(material)) material.stencilWrite = false;
        }
        return;
      }
      for (const material of Array.isArray(m) ? m : [m]) {
        if (material.stencilWrite && this.#clipped.has(material) && material.stencilRef === ref) {
          continue;
        }
        material.stencilWrite = true;
        material.stencilRef = ref;
        material.stencilFunc = EqualStencilFunc;
        this.#clipped.add(material);
      }
    });
  }
}

/** Create a {@link View3DProjector}. */
export function createView3DProjector(angles: View3DAngles): View3DProjector {
  return new View3DProjector(angles);
}
