import {
  EqualStencilFunc,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Viewport, type ViewportHost } from '../core/viewport.ts';
import { createResourceManager } from '../resources.ts';
import { createExtrusionPrimitive, UNCLIPPED } from './extrusion.ts';
import { loadMeshModule } from './mesh-loader.ts';
import { createView3DProjector } from './view3d.ts';
import { view3dProject } from './view3d-camera.ts';

/**
 * The 2.5D view's projector (plan E8.9): what it does to a 2D viewport (camera, clip, background,
 * stencil clipping of flat objects) and undoes, and the pointer mapping onto the plot plane or the
 * extruded shapes over it.
 */

function host(): ViewportHost {
  return { canvasWidth: 800, canvasHeight: 600, pixelRatio: 1, invalidate: vi.fn<() => void>() };
}

const RECT = { x: 100, y: 50, width: 500, height: 400 };

describe('View3DProjector', () => {
  it('takes over the camera, clip and background of a 2D viewport, and gives them back', () => {
    const vp = new Viewport(host(), { rect: RECT, background: [0.1, 0.2, 0.3, 1] });
    const flatCamera = vp.camera;
    const p = createView3DProjector({ tilt: 20, rotation: -20, perspective: 0.5 });
    p.attach(vp);
    expect(vp.projector).toBe(p);
    expect(vp.camera).toBe(p.camera);
    expect(vp.clip).toBe(false);
    expect(vp.renderArea).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(vp.background).toBeNull();
    const plane = vp.scene.children.find((o) => o.name === 'holochart:view3d-plane') as Mesh<
      PlaneGeometry,
      MeshBasicMaterial
    >;
    expect(plane.material.color.getHexString()).not.toBe('ffffff');
    expect(plane.scale.toArray()).toEqual([500, 400, 1]);
    // The chart paints the background again on its next run: the plane takes it over again.
    vp.background = [1, 1, 1, 1];
    p.takeBackground();
    expect(vp.background).toBeNull();
    expect(plane.material.color.getHexString()).toBe('ffffff');
    p.detach();
    expect(vp.projector).toBeNull();
    expect(vp.camera).toBe(flatCamera);
    expect(vp.clip).toBe(true);
    expect(vp.background).toEqual([1, 1, 1, 1]);
    expect(vp.scene.children).not.toContain(plane);
  });

  it('clips flat objects to the tilted plot area with the stencil, not unclipped ones', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const flat = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    const free = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    free.userData[UNCLIPPED] = true;
    vp.scene.add(flat, free, new Object3D());
    const p = createView3DProjector({ tilt: 10, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    const plane = vp.scene.children.find((o) => o.name === 'holochart:view3d-plane') as Mesh;
    plane.onBeforeRender(
      null as never,
      vp.scene as Scene,
      p.camera,
      plane.geometry,
      plane.material as never,
      null as never,
    );
    expect(flat.material.stencilWrite).toBe(true);
    expect(flat.material.stencilFunc).toBe(EqualStencilFunc);
    expect(flat.material.stencilRef).toBe((plane.material as MeshBasicMaterial).stencilRef);
    expect(free.material.stencilWrite).toBe(false);
    p.detach();
    expect(flat.material.stencilWrite).toBe(false);
  });

  it('follows the flag every frame: lifted after a clipped frame, an object is released', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const line = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    vp.scene.add(line);
    const p = createView3DProjector({ tilt: 10, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    const plane = vp.scene.children.find((o) => o.name === 'holochart:view3d-plane') as Mesh;
    const frame = () =>
      plane.onBeforeRender(
        null as never,
        vp.scene as Scene,
        p.camera,
        plane.geometry,
        plane.material as never,
        null as never,
      );
    // Drawn flat first (clipped), then lifted onto extruded shapes whose code arrived later.
    frame();
    expect(line.material.stencilWrite).toBe(true);
    line.userData[UNCLIPPED] = true;
    frame();
    expect(line.material.stencilWrite).toBe(false);
    // Back on the plane: clipped again.
    delete line.userData[UNCLIPPED];
    frame();
    expect(line.material.stencilWrite).toBe(true);
    p.detach();
  });

  it('follows its viewport: a new rect or angles recompute the camera', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const p = createView3DProjector({ tilt: 0, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    // Flat at tilt 0: points of the plot plane stay where the flat view draws them.
    expect(p.project(300, 200)).toEqual([expect.closeTo(300, 6), expect.closeTo(200, 6)]);
    p.setAngles({ tilt: 30, rotation: 20, perspective: 0.5 });
    const [x, y] = p.project(300, 200);
    expect(Math.hypot(x - 300, y - 200)).toBeGreaterThan(1);
    expect(p.unproject(x, y)).toEqual([expect.closeTo(300, 6), expect.closeTo(200, 6)]);
    vp.setRect({ x: 0, y: 0, width: 300, height: 300 });
    expect(p.view?.target.x).toBe(150);
  });

  it('maps a pointer onto the extruded shape in front of the plot plane', async () => {
    const mesh = await loadMeshModule();
    const vp = new Viewport(host(), { rect: RECT });
    const p = createView3DProjector({ tilt: 30, rotation: -30, perspective: 0.5 });
    p.attach(vp);
    // A box over world x 200–300, y 0–200 (container x 300–400), 60 px deep.
    const box = createExtrusionPrimitive(
      { resources: createResourceManager(), invalidate: vi.fn() },
      { x0: [200], x1: [300], y0: [0], y1: [200], depth: 60 },
      mesh,
    );
    box.setTransform({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    vp.add(box);
    // Its front face at world (250, 100), 60 px up: on screen there, the plot plane shows
    // somewhere else, but the pointer maps to the box's footprint.
    const [sx, sy] = view3dProject(p.view!, vp.renderArea, 250, 100, 60);
    const [cx, cy] = p.unproject(sx, sy);
    expect(cx - RECT.x).toBeCloseTo(250, 6);
    expect(RECT.y + RECT.height - cy).toBeCloseTo(100, 6);
    // Hidden: the plane then.
    box.object.visible = false;
    const [px] = p.unproject(sx, sy);
    expect(Math.abs(px - RECT.x - 250)).toBeGreaterThan(5);
  });
});
