import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import type { TextData } from './text.ts';

/**
 * Where the text primitive puts its labels: the member matrices troika's `BatchedText` packs and
 * draws with. Placement is CPU math (data transform, px offsets, rotation, billboard orientation,
 * screen-size scale), so it is checked here without WebGL.
 *
 * troika is mocked like in text.test.ts (its worker needs browser globals): members and the batch
 * are plain `Object3D`s. Per-frame placement runs in the batch's `onBeforeRender`, which three
 * calls with the renderer and camera right before drawing; {@link renderFrame} makes that call the
 * way `WebGLRenderer.render` does (world matrices updated first), with a renderer that only has
 * the frame counter the primitive reads. No GL context is involved.
 */
function freshState() {
  return {
    /** Pending `sync` callbacks; typesetting finishes when a test calls them. */
    syncs: [] as (() => void)[],
    /** What troika's own `onBeforeRender` saw each time it ran: every member's scale. */
    packed: [] as number[][],
  };
}
type MockState = ReturnType<typeof freshState>;
let troika: MockState = freshState();

interface MockMember extends Object3D {
  text: string;
}
interface MockBatch extends Object3D {
  readonly members: Set<MockMember>;
}

async function mockTroika(state: MockState) {
  const { Object3D } = await import('three');
  class Text extends Object3D {
    text = '';
    constructor() {
      super();
      Object.assign(this, { dispose: (): void => {} });
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    readonly members = new Set<Text>();
    constructor() {
      super();
      // troika packs the member matrices into its data texture here.
      const pack = (): void => {
        state.packed.push([...this.members].map((m) => m.matrix.elements[0]!));
      };
      Object.assign(this, { dispose: (): void => {}, onBeforeRender: pack });
    }
    addText(text: Text): void {
      this.members.add(text);
    }
    removeText(text: Text): void {
      this.members.delete(text);
    }
    sync(callback?: () => void): void {
      state.syncs.push(() => callback?.());
    }
  }
  return {
    Text,
    BatchedText,
    configureTextBuilder: (): void => {},
    preloadFont: (_options: object, callback: () => void): void => callback(),
  };
}

type TextModule = typeof import('./text.ts');
let mod: TextModule;

function context(): PrimitiveContext & { invalidations: number } {
  const ctx = {
    resources: createResourceManager(),
    invalidations: 0,
    invalidate() {
      ctx.invalidations++;
    },
  };
  return ctx;
}

/** A primitive whose engine has loaded and whose labels are typeset. No font files are involved. */
async function attached(data: Partial<TextData>) {
  const ctx = context();
  const text = mod.createTextPrimitive(ctx, data, { resolveFont: () => undefined });
  await vi.waitFor(() => expect(text.object.children).toHaveLength(1));
  for (const done of troika.syncs.splice(0)) done();
  await text.ready;
  const batch = text.object.children[0] as MockBatch;
  const member = (label: string): MockMember => {
    const found = [...batch.members].find((m) => m.text === label);
    if (!found) throw new Error(`no member for label ${label}`);
    return found;
  };
  return { ctx, text, batch, member };
}

/** Call the batch's render hook like `WebGLRenderer.render` does for frame number `frame`. */
function renderFrame(batch: MockBatch, camera: Camera, frame: number): void {
  camera.updateMatrixWorld();
  batch.updateWorldMatrix(true, false);
  const renderer = { info: { render: { frame } } };
  (batch.onBeforeRender as unknown as (...args: unknown[]) => void)(
    renderer,
    null,
    camera,
    null,
    null,
    null,
  );
}

function expectVector(actual: Vector3, expected: [number, number, number]): void {
  expect(actual.x).toBeCloseTo(expected[0], 9);
  expect(actual.y).toBeCloseTo(expected[1], 9);
  expect(actual.z).toBeCloseTo(expected[2], 9);
}

/** The 2D pixel-space camera: 640 × 400 world units, +y up. */
const pixelCamera = (): OrthographicCamera => new OrthographicCamera(0, 640, 400, 0, -1000, 1000);
const VIEWPORT = { width: 640, height: 400, pixelRatio: 1 };

beforeEach(async () => {
  vi.resetModules();
  troika = freshState();
  const state = troika;
  vi.doMock('troika-three-text', () => mockTroika(state));
  mod = await import('./text.ts');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TextPrimitive: static placement (fixed mode, world sizing)', () => {
  it('maps data positions through the transform; px offsets are +y down and not scaled', async () => {
    const { ctx, text, member } = await attached({
      labels: [
        { text: 'a', x: 1, y: 2 },
        { text: 'b', x: 3, y: 4, z: 5, offset: [10, 5] },
      ],
      sizing: 'world',
    });
    // Identity transform: world = data.
    expectVector(member('a').position, [1, 2, 0]);
    expectVector(member('b').position, [3 + 10, 4 - 5, 5]);
    expectVector(member('b').scale, [1, 1, 1]);

    const invalidations = ctx.invalidations;
    text.setTransform({ scaleX: 2, scaleY: 3, offsetX: 10, offsetY: 20 });
    // world = data · scale + offset; the label's px offset stays 10 px right, 5 px down.
    expectVector(member('a').position, [2 + 10, 6 + 20, 0]);
    expectVector(member('b').position, [6 + 10 + 10, 12 + 20 - 5, 5]);
    // The matrices troika packs are up to date, a frame was requested, nothing was re-typeset.
    expect(member('a').matrix.elements[12]).toBeCloseTo(12, 9);
    expect(member('a').matrix.elements[13]).toBeCloseTo(26, 9);
    expect(ctx.invalidations).toBe(invalidations + 1);
    expect(troika.syncs).toHaveLength(0);
  });

  it('honors the third axis of the transform', async () => {
    const { text, member } = await attached({
      labels: [{ text: 'a', x: 0, y: 0, z: 2 }],
      sizing: 'world',
    });
    text.setTransform({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, scaleZ: 10, offsetZ: -5 });
    expectVector(member('a').position, [0, 0, 15]);
  });

  it('keeps float64 precision for large coordinates (positions are origin-relative)', async () => {
    // 0.25 apart at 1e9: not representable in float32 (spacing 64 there), but the transform zooms
    // in on exactly that range.
    const { text, member } = await attached({
      labels: [
        { text: 'a', x: 1e9, y: 0 },
        { text: 'b', x: 1e9 + 0.25, y: 0 },
      ],
      sizing: 'world',
    });
    text.setTransform({ scaleX: 4, scaleY: 1, offsetX: -4e9, offsetY: 0 });
    expectVector(member('a').position, [0, 0, 0]);
    expectVector(member('b').position, [1, 0, 0]);
  });

  it('rotates a label clockwise on screen about its anchor', async () => {
    const { member } = await attached({
      labels: [{ text: 'a', x: 7, y: 8, angle: 90 }],
      sizing: 'world',
    });
    // The anchor does not move; the text's +x axis now points down the screen (world −y).
    expectVector(member('a').position, [7, 8, 0]);
    expectVector(new Vector3(1, 0, 0).applyQuaternion(member('a').quaternion), [0, -1, 0]);
  });

  it('collapses labels that draw nothing to a point, and restores them when they draw again', async () => {
    const { text, batch } = await attached({
      labels: [
        { text: '', x: 5, y: 6 },
        { text: 'shown', x: 1, y: 1 },
      ],
      sizing: 'world',
    });
    const [empty, shown] = [...batch.members] as [MockMember, MockMember];
    expectVector(empty.scale, [0, 0, 0]);
    expectVector(empty.position, [5, 6, 0]);
    expect(empty.matrix.elements[0]).toBe(0);
    expectVector(shown.scale, [1, 1, 1]);

    text.update({
      labels: [
        { text: 'now visible', x: 5, y: 6 },
        { text: 'shown', x: 1, y: 1 },
      ],
    });
    expect(empty.text).toBe('now visible'); // the same member, re-typeset
    expectVector(empty.scale, [1, 1, 1]);
    expect(empty.matrix.elements[0]).toBe(1);
  });

  it('hides the batch while there are no labels', async () => {
    const { text, batch } = await attached({
      labels: [{ text: 'a', x: 0, y: 0 }],
      sizing: 'world',
    });
    expect(batch.visible).toBe(true);
    text.update({ labels: [] });
    expect(batch.visible).toBe(false);
    expect(batch.members.size).toBe(0);
    text.update({ labels: [{ text: 'b', x: 0, y: 0 }] });
    expect(batch.visible).toBe(true);
  });
});

describe('TextPrimitive: mode and sizing changes', () => {
  it('culls by bounds only when placement is static', async () => {
    const { ctx, text, batch } = await attached({
      labels: [{ text: 'a', x: 0, y: 0 }],
      sizing: 'world',
      mode: 'fixed',
    });
    expect(batch.frustumCulled).toBe(true);
    // Per-frame modes may place labels anywhere: bounds-based culling would lag a frame behind.
    text.update({ sizing: 'screen' });
    expect(batch.frustumCulled).toBe(false);
    text.update({ sizing: 'world', mode: 'billboard' });
    expect(batch.frustumCulled).toBe(false);
    const invalidations = ctx.invalidations;
    text.update({ mode: 'fixed' });
    expect(batch.frustumCulled).toBe(true);
    expect(ctx.invalidations).toBe(invalidations + 1);
    // None of this changes glyphs.
    expect(troika.syncs).toHaveLength(0);
  });

  it('re-applies static placement at once when leaving a per-frame mode', async () => {
    const { text, batch, member } = await attached({
      labels: [{ text: 'a', x: 0, y: 0 }],
      sizing: 'world',
      mode: 'billboard',
    });
    const camera = new PerspectiveCamera(90, 1, 0.1, 100);
    camera.position.set(10, 0, 0);
    camera.lookAt(0, 0, 0);
    text.setViewport({ width: 100, height: 100, pixelRatio: 1 });
    renderFrame(batch, camera, 1);
    expect(member('a').quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 2, 9);

    text.update({ mode: 'fixed' });
    // Back in the world XY plane without waiting for a frame.
    expect(member('a').quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 9);
    expect(member('a').matrix.elements[0]).toBeCloseTo(1, 9);
  });
});

describe('TextPrimitive: screen-sized labels under an orthographic camera', () => {
  const labels = [{ text: 'a', x: 100, y: 50, offset: [10, 5] as const }];

  it('scales members by world units per CSS px, including their px offsets', async () => {
    const { text, batch, member } = await attached({ labels });
    const camera = pixelCamera();
    text.setViewport(VIEWPORT);
    renderFrame(batch, camera, 1);
    // Pixel space: one world unit per px.
    expectVector(member('a').scale, [1, 1, 1]);
    expectVector(member('a').position, [110, 45, 0]);

    // The same 400 world units shown in 200 px: two world units per px.
    text.setViewport({ width: 320, height: 200, pixelRatio: 1 });
    renderFrame(batch, camera, 2);
    expectVector(member('a').scale, [2, 2, 2]);
    expectVector(member('a').position, [120, 40, 0]);
  });

  it('follows the camera zoom', async () => {
    const { text, batch, member } = await attached({ labels });
    const camera = pixelCamera();
    camera.zoom = 4;
    camera.updateProjectionMatrix();
    text.setViewport(VIEWPORT);
    renderFrame(batch, camera, 1);
    expectVector(member('a').scale, [0.25, 0.25, 0.25]);
    expectVector(member('a').position, [102.5, 48.75, 0]);
  });

  it("divides out the scale of the primitive's parent", async () => {
    const { text, batch, member } = await attached({ labels });
    // Everything under `object` is drawn 4× larger, so members shrink to stay 1 px per px.
    text.object.scale.setScalar(4);
    text.setViewport(VIEWPORT);
    renderFrame(batch, pixelCamera(), 1);
    expectVector(member('a').scale, [0.25, 0.25, 0.25]);
    expectVector(member('a').position, [100 + 2.5, 50 - 1.25, 0]);
  });

  it('places labels at scale 1 until a viewport size is known', async () => {
    const { batch, member } = await attached({ labels });
    renderFrame(batch, pixelCamera(), 1);
    expectVector(member('a').scale, [1, 1, 1]);
    expectVector(member('a').position, [110, 45, 0]);
  });

  it('places once per frame, and again only when something placement depends on changed', async () => {
    const { text, batch, member } = await attached({ labels });
    const camera = pixelCamera();
    text.setViewport(VIEWPORT);
    const placed = vi.spyOn(member('a'), 'updateMatrix');

    renderFrame(batch, camera, 1);
    expect(placed).toHaveBeenCalledTimes(1);
    // The outline pass of the same frame.
    renderFrame(batch, camera, 1);
    expect(placed).toHaveBeenCalledTimes(1);
    // Later frames, panned: fixed labels under an orthographic camera depend on the px scale only.
    camera.position.x += 50;
    renderFrame(batch, camera, 2);
    renderFrame(batch, camera, 3);
    expect(placed).toHaveBeenCalledTimes(1);

    // Zoomed: the px scale changed.
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    renderFrame(batch, camera, 4);
    expect(placed).toHaveBeenCalledTimes(2);
    expectVector(member('a').scale, [0.5, 0.5, 0.5]);

    // A new data transform moves the labels on the next frame.
    text.setTransform({ scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 });
    renderFrame(batch, camera, 5);
    expect(placed).toHaveBeenCalledTimes(3);
    expectVector(member('a').position, [200 + 5, 100 - 2.5, 0]);

    // So does a resize, even within the frame already placed.
    text.setViewport({ width: 640, height: 800, pixelRatio: 1 });
    renderFrame(batch, camera, 5);
    expect(placed).toHaveBeenCalledTimes(4);
    expectVector(member('a').scale, [0.25, 0.25, 0.25]);
  });

  it("runs before troika's own render hook, which packs the matrices, on every pass", async () => {
    const { text, batch } = await attached({ labels });
    const camera = pixelCamera();
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    text.setViewport(VIEWPORT);
    renderFrame(batch, camera, 1);
    renderFrame(batch, camera, 1);
    // Both passes packed the scale of this frame (0.5), not the unplaced identity.
    expect(troika.packed).toEqual([[0.5], [0.5]]);
  });
});

describe('TextPrimitive: frames in static mode or without labels', () => {
  it('leaves statically placed labels alone', async () => {
    const { text, batch, member } = await attached({
      labels: [{ text: 'a', x: 3, y: 4 }],
      sizing: 'world',
      mode: 'fixed',
    });
    const camera = pixelCamera();
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    text.setViewport(VIEWPORT);
    const placed = vi.spyOn(member('a'), 'updateMatrix');
    renderFrame(batch, camera, 1);
    expect(placed).not.toHaveBeenCalled();
    // World-sized: no px scale applies.
    expectVector(member('a').scale, [1, 1, 1]);
    expect(troika.packed).toEqual([[1]]);
  });

  it("still runs troika's hook when every label was removed", async () => {
    const { text, batch } = await attached({ labels: [{ text: 'a', x: 0, y: 0 }] });
    text.update({ labels: [] });
    renderFrame(batch, pixelCamera(), 1);
    expect(troika.packed).toEqual([[]]);
  });
});

describe('TextPrimitive: perspective cameras', () => {
  /** 90° vertical field of view: at depth d the view is 2d world units high. */
  const camera90 = (): PerspectiveCamera => new PerspectiveCamera(90, 1, 0.1, 100);
  const SQUARE = { width: 100, height: 100, pixelRatio: 1 };

  it('sizes each screen-sized label by its own depth and collapses labels behind the camera', async () => {
    const { text, batch, member } = await attached({
      labels: [
        { text: 'near', x: 0, y: 0, z: -10 },
        { text: 'far', x: 0, y: 0, z: -20, offset: [10, 0] },
        { text: 'behind', x: 0, y: 0, z: 5 },
      ],
      mode: 'billboard',
    });
    text.setViewport(SQUARE);
    renderFrame(batch, camera90(), 1);
    // 100 px show 2·depth world units: depth / 50 world units per px.
    expectVector(member('near').scale, [0.2, 0.2, 0.2]);
    expectVector(member('far').scale, [0.4, 0.4, 0.4]);
    // 10 px to the right at that depth.
    expectVector(member('far').position, [4, 0, -20]);
    expectVector(member('behind').scale, [0, 0, 0]);
    expectVector(member('behind').position, [0, 0, 5]);
    // The camera looks down −z unrotated: billboards keep the identity orientation.
    expect(member('near').quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 9);
  });

  it('turns billboards to face the camera; offsets and rotation follow the screen axes', async () => {
    const { text, batch, member } = await attached({
      labels: [{ text: 'a', x: 0, y: 0, z: 0, offset: [5, 0], angle: 90 }],
      mode: 'billboard',
    });
    const camera = camera90();
    camera.position.set(10, 0, 0);
    camera.lookAt(0, 0, 0);
    text.setViewport(SQUARE);
    renderFrame(batch, camera, 1);
    const a = member('a');
    // Depth 10: 0.2 world units per px.
    expectVector(a.scale, [0.2, 0.2, 0.2]);
    // The text plane's normal points at the camera (+x).
    expectVector(new Vector3(0, 0, 1).applyQuaternion(a.quaternion), [1, 0, 0]);
    // Seen from +x, screen-right is world −z: 5 px are 1 world unit that way.
    expectVector(a.position, [0, 0, -1]);
    // Rotated 90° clockwise on screen: the text's +x axis points screen-down (world −y).
    expectVector(new Vector3(1, 0, 0).applyQuaternion(a.quaternion), [0, -1, 0]);

    // The camera orbits to +z: the next frame turns the label with it.
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    renderFrame(batch, camera, 2);
    expectVector(new Vector3(0, 0, 1).applyQuaternion(a.quaternion), [0, 0, 1]);
    expectVector(a.scale, [0.4, 0.4, 0.4]);
    expectVector(a.position, [2, 0, 0]);
  });

  it("faces the camera whatever the orientation of the primitive's parent", async () => {
    const { text, batch, member } = await attached({
      // In the parent's frame; the parent's quarter turn about +y carries it to world (0, 0, −10).
      labels: [{ text: 'a', x: 10, y: 0, z: 0 }],
      mode: 'billboard',
    });
    text.object.rotation.y = Math.PI / 2;
    text.setViewport(SQUARE);
    const camera = camera90();
    renderFrame(batch, camera, 1);
    const world = text.object.quaternion.clone().multiply(member('a').quaternion);
    expect(world.angleTo(camera.quaternion)).toBeCloseTo(0, 9);
    expectVector(member('a').scale, [0.2, 0.2, 0.2]);
  });

  it('keeps world-sized billboards at their size at any depth', async () => {
    const { text, batch, member } = await attached({
      labels: [
        { text: 'near', x: 0, y: 0, z: 0, offset: [5, 0] },
        { text: 'far', x: -30, y: 0, z: 0 },
      ],
      mode: 'billboard',
      sizing: 'world',
    });
    const camera = camera90();
    camera.position.set(10, 0, 0);
    camera.lookAt(0, 0, 0);
    text.setViewport(SQUARE);
    renderFrame(batch, camera, 1);
    expectVector(member('near').scale, [1, 1, 1]);
    expectVector(member('far').scale, [1, 1, 1]);
    // 5 world units along screen-right (world −z).
    expectVector(member('near').position, [0, 0, -5]);
    expectVector(new Vector3(0, 0, 1).applyQuaternion(member('far').quaternion), [1, 0, 0]);
  });

  it('re-places billboards every frame, once per frame and camera', async () => {
    const { text, batch, member } = await attached({
      labels: [{ text: 'a', x: 0, y: 0, z: -10 }],
      mode: 'billboard',
    });
    text.setViewport(SQUARE);
    const camera = camera90();
    const placed = vi.spyOn(member('a'), 'updateMatrix');
    renderFrame(batch, camera, 1);
    renderFrame(batch, camera, 1);
    expect(placed).toHaveBeenCalledTimes(1);
    renderFrame(batch, camera, 2);
    expect(placed).toHaveBeenCalledTimes(2);
    // A second viewport's camera in the same frame.
    renderFrame(batch, camera90(), 2);
    expect(placed).toHaveBeenCalledTimes(3);
  });

  it('sizes fixed-orientation labels by depth without turning them', async () => {
    const { text, batch, member } = await attached({
      labels: [{ text: 'a', x: 0, y: 0, z: 0 }],
      mode: 'fixed',
    });
    text.setViewport(SQUARE);
    const camera = camera90();
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    renderFrame(batch, camera, 1);
    // View-space depth of the origin: the distance along the view direction, √200.
    const perPx = Math.sqrt(200) / 50;
    expectVector(member('a').scale, [perPx, perPx, perPx]);
    expect(member('a').quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 9);
  });
});
