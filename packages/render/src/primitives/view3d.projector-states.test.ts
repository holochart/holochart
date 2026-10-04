import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  type Scene,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Viewport, type ViewportHost } from '../core/viewport.ts';
import { createResourceManager } from '../resources.ts';
import { createExtrusionPrimitive, UNCLIPPED } from './extrusion.ts';
import { loadMeshModule } from './mesh-loader.ts';
import { createView3DProjector, type View3DProjector } from './view3d.ts';

/**
 * The 2.5D projector (plan E8.9) in the states around its normal use: before it has a viewport,
 * with a parallel projection, attached twice, detached, on a disposed viewport, and the stencil
 * clipping of objects with several materials or materials shared between subplots.
 */

function host(): ViewportHost & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { canvasWidth: 800, canvasHeight: 600, pixelRatio: 1, invalidate: vi.fn<() => void>() };
}

const RECT = { x: 100, y: 50, width: 500, height: 400 };

type Plane = Mesh<PlaneGeometry, MeshBasicMaterial>;

function planeOf(vp: Viewport): Plane {
  return vp.scene.children.find((o) => o.name === 'holochart:view3d-plane') as Plane;
}

/** What three.js does before drawing the projector's plot-area quad: the stencil setup. */
function frame(vp: Viewport, p: View3DProjector, plane = planeOf(vp)): void {
  plane.onBeforeRender(
    null as never,
    vp.scene as Scene,
    p.camera,
    plane.geometry,
    plane.material as never,
    null as never,
  );
}

function stencil(m: MeshBasicMaterial) {
  return { write: m.stencilWrite, ref: m.stencilRef, func: m.stencilFunc };
}

describe('View3DProjector without a viewport', () => {
  it('maps points to themselves and has a perspective camera until its first layout', () => {
    const p = createView3DProjector({ tilt: 30, rotation: 20, perspective: 0.5 });
    expect(p.viewport).toBeNull();
    expect(p.view).toBeNull();
    expect(p.camera).toBeInstanceOf(PerspectiveCamera);
    expect(p.project(12, 34)).toEqual([12, 34]);
    expect(p.project(12, 34, 60)).toEqual([12, 34]);
    expect(p.unproject(12, 34)).toEqual([12, 34]);
  });

  it('keeps new angles for the viewport it is attached to later', () => {
    const p = createView3DProjector({ tilt: 0, rotation: 0, perspective: 0.5 });
    p.setAngles({ tilt: 30, rotation: 20, perspective: 0.5 });
    expect(p.angles).toEqual({ tilt: 30, rotation: 20, perspective: 0.5 });
    expect(p.view).toBeNull();
    const vp = new Viewport(host(), { rect: RECT });
    p.attach(vp);
    expect(p.viewport).toBe(vp);
    // Tilted: a point off the center is not where the flat view draws it.
    const [x, y] = p.project(200, 100);
    expect(Math.hypot(x - 200, y - 100)).toBeGreaterThan(1);
    p.dispose();
  });
});

describe('View3DProjector cameras', () => {
  it('perspective 0 draws with an orthographic camera over the flat view’s frustum', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const p = createView3DProjector({ tilt: 0, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    expect(vp.camera).toBeInstanceOf(PerspectiveCamera);
    p.setAngles({ tilt: 0, rotation: 0, perspective: 0 });
    expect(vp.camera).toBeInstanceOf(OrthographicCamera);
    expect(vp.camera).toBe(p.camera);
    const c = vp.camera as OrthographicCamera;
    // The whole 800 × 600 canvas seen from the rect's bottom-left corner at container (100, 450):
    // x from -100 to 700, y from -150 to 450; relative to the rect's center (250, 200).
    expect([c.left, c.right, c.top, c.bottom]).toEqual([-350, 450, 250, -350]);
    expect(c.position.x).toBe(250);
    expect(c.position.y).toBe(200);
    expect(c.position.z).toBeGreaterThan(0);
    // Flat: every point of the plot plane is where the flat view draws it.
    expect(p.project(300, 200)).toEqual([expect.closeTo(300, 6), expect.closeTo(200, 6)]);
    expect(p.unproject(300, 200)).toEqual([expect.closeTo(300, 6), expect.closeTo(200, 6)]);
    p.dispose();
  });
});

describe('View3DProjector attach and detach', () => {
  it('attaching to the same viewport again changes nothing', () => {
    const vp = new Viewport(host(), { rect: RECT, background: [1, 0, 0, 1] });
    const p = createView3DProjector({ tilt: 20, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    const setClip = vi.spyOn(vp, 'setClip');
    p.attach(vp);
    expect(setClip).not.toHaveBeenCalled();
    expect(vp.scene.children.filter((o) => o.name === 'holochart:view3d-plane')).toHaveLength(1);
    // The background it took over is still painted by the plane, and given back on detach.
    expect(planeOf(vp).material.color.getHexString()).toBe('ff0000');
    p.detach();
    expect(vp.background).toEqual([1, 0, 0, 1]);
  });

  it('paints the background only when there is a visible one', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const p = createView3DProjector({ tilt: 20, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    const material = planeOf(vp).material;
    expect(material.colorWrite).toBe(false);
    vp.background = [0, 0, 1, 0.5];
    p.takeBackground();
    expect(material.colorWrite).toBe(true);
    expect(material.color.getHexString()).toBe('0000ff');
    expect(material.opacity).toBe(0.5);
    vp.background = [0, 0, 1, 0];
    p.takeBackground();
    expect(material.colorWrite).toBe(false);
    p.dispose();
  });

  it('a detached projector leaves its former viewport’s background alone', () => {
    const vp = new Viewport(host(), { rect: RECT, background: [0, 1, 0, 1] });
    const p = createView3DProjector({ tilt: 20, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    p.detach();
    expect(p.viewport).toBeNull();
    vp.background = [1, 1, 0, 1];
    p.takeBackground();
    expect(vp.background).toEqual([1, 1, 0, 1]);
    // Detaching again is a no-op too.
    const setClip = vi.spyOn(vp, 'setClip');
    p.detach();
    expect(setClip).not.toHaveBeenCalled();
  });

  it('detaching from a disposed viewport does not lay it out again', () => {
    const h = host();
    const vp = new Viewport(h, { rect: RECT, background: [0, 1, 0, 1] });
    const flat = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    vp.scene.add(flat);
    const p = createView3DProjector({ tilt: 20, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    frame(vp, p);
    expect(flat.material.stencilWrite).toBe(true);
    const plane = planeOf(vp);
    vp.dispose();
    h.invalidate.mockClear();
    p.detach();
    expect(p.viewport).toBeNull();
    expect(plane.parent).toBeNull();
    // Materials are released all the same.
    expect(flat.material.stencilWrite).toBe(false);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(vp.clip).toBe(false);
    expect(vp.background).toBeNull();
  });
});

describe('View3DProjector stencil clipping', () => {
  it('clips and releases every material of a multi-material object', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const a = new MeshBasicMaterial();
    const b = new MeshBasicMaterial();
    const multi = new Mesh(new PlaneGeometry(), [a, b]);
    vp.scene.add(multi);
    const p = createView3DProjector({ tilt: 10, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    const ref = planeOf(vp).material.stencilRef;
    const clipped = { write: true, ref, func: EqualStencilFunc };
    frame(vp, p);
    expect([stencil(a), stencil(b)]).toEqual([clipped, clipped]);
    // The next frame finds them as it left them.
    frame(vp, p);
    expect([stencil(a), stencil(b)]).toEqual([clipped, clipped]);
    multi.userData[UNCLIPPED] = true;
    frame(vp, p);
    expect([a.stencilWrite, b.stencilWrite]).toEqual([false, false]);
    p.dispose();
  });

  it('takes over a material that had its own stencil setup, until it detaches', () => {
    const vp = new Viewport(host(), { rect: RECT });
    const material = new MeshBasicMaterial({
      stencilWrite: true,
      stencilRef: 200,
      stencilFunc: AlwaysStencilFunc,
    });
    vp.scene.add(new Mesh(new PlaneGeometry(), material));
    const p = createView3DProjector({ tilt: 10, rotation: 0, perspective: 0.5 });
    p.attach(vp);
    frame(vp, p);
    expect(stencil(material)).toEqual({
      write: true,
      ref: planeOf(vp).material.stencilRef,
      func: EqualStencilFunc,
    });
    p.detach();
    expect(material.stencilWrite).toBe(false);
  });

  it('a material shared by two tilted subplots is clipped to the one being drawn', () => {
    const shared = new MeshBasicMaterial();
    const first = new Viewport(host(), { rect: RECT });
    const second = new Viewport(host(), { rect: { x: 0, y: 0, width: 200, height: 200 } });
    first.scene.add(new Mesh(new PlaneGeometry(), shared));
    second.scene.add(new Mesh(new PlaneGeometry(), shared));
    const p1 = createView3DProjector({ tilt: 10, rotation: 0, perspective: 0.5 });
    const p2 = createView3DProjector({ tilt: 10, rotation: 0, perspective: 0.5 });
    p1.attach(first);
    p2.attach(second);
    const ref1 = planeOf(first).material.stencilRef;
    const ref2 = planeOf(second).material.stencilRef;
    expect(ref1).not.toBe(ref2);
    frame(first, p1);
    expect(shared.stencilRef).toBe(ref1);
    frame(second, p2);
    expect(shared.stencilRef).toBe(ref2);
    // The next frame of the first subplot: its own plot area again.
    frame(first, p1);
    expect(stencil(shared)).toEqual({ write: true, ref: ref1, func: EqualStencilFunc });
    p1.dispose();
    p2.dispose();
  });
});

describe('View3DProjector pointer mapping', () => {
  it('maps a pointer beside an extruded shape onto the plot plane', async () => {
    const mesh = await loadMeshModule();
    const vp = new Viewport(host(), { rect: RECT });
    const p = createView3DProjector({ tilt: 30, rotation: -30, perspective: 0.5 });
    p.attach(vp);
    // A box over world x 200–300, y 0–200, 60 px deep.
    const box = createExtrusionPrimitive(
      { resources: createResourceManager(), invalidate: vi.fn() },
      { x0: [200], x1: [300], y0: [0], y1: [200], depth: 60 },
      mesh,
    );
    box.setTransform({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    vp.add(box);
    // World (50, 300) on the plane = container (150, 150): far from the box, and seen from the
    // upper left the ray to it does not cross the box either.
    const [sx, sy] = p.project(150, 150);
    expect(p.unproject(sx, sy)).toEqual([expect.closeTo(150, 6), expect.closeTo(150, 6)]);
    p.dispose();
  });
});
