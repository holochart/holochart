import {
  BackSide,
  DoubleSide,
  Matrix4,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  PerspectiveCamera,
  ShaderMaterial,
  Vector4,
  type BufferAttribute,
  type Camera,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createLightRig } from './lighting.ts';
import { MeshPrimitive, type MeshInput } from './mesh.ts';

function context(): PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

/** Two triangles sharing an edge (a unit square at z = 0), plus a far-off third vertex set. */
const SQUARE = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
const INDEX = new Uint32Array([0, 1, 2, 0, 2, 3]);

function mesh(input: Partial<MeshInput> = {}, ctx = context()): MeshPrimitive {
  return new MeshPrimitive(ctx, { positions: SQUARE, indices: INDEX, ...input });
}

function attr(p: MeshPrimitive, name: string): BufferAttribute {
  return p.object.geometry.getAttribute(name) as BufferAttribute;
}

function defines(p: MeshPrimitive): Record<string, unknown> {
  return (p.material as ShaderMaterial).defines as Record<string, unknown>;
}

const fakeRenderer = {
  getCurrentViewport: (v: Vector4) => v.set(0, 0, 640, 400),
  getPixelRatio: () => 1,
  getRenderTarget: () => null,
} as unknown as WebGLRenderer;

function camera(z = 5): PerspectiveCamera {
  const c = new PerspectiveCamera(45, 1.6, 0.1, 100);
  c.position.set(0.5, 0.5, z);
  c.lookAt(0.5, 0.5, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

function frame(p: MeshPrimitive, cam: Camera): void {
  p.object.updateMatrixWorld();
  p.object.onBeforeRender(
    fakeRenderer,
    {} as Scene,
    cam,
    p.object.geometry,
    p.object.material as Material,
    null as never,
  );
}

describe('MeshPrimitive geometry', () => {
  it('draws an indexed mesh with computed (Plotly) vertex normals', () => {
    const p = mesh();
    expect(p.layout).toMatchObject({ expanded: false, vertexCount: 4, triangleCount: 2 });
    expect([...attr(p, 'normal').array]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect([...p.object.geometry.getIndex()!.array]).toEqual([...INDEX]);
    expect(p.material).toBeInstanceOf(ShaderMaterial);
    expect(defines(p)['HC_COLOR']).toBeUndefined();
    expect(p.material.side).toBe(DoubleSide);
    expect(p.material.transparent).toBe(false);
    expect(p.material.depthWrite).toBe(true);
  });

  it('flat shading expands the triangles and uses face normals', () => {
    // A bent square: the second triangle is tilted, so smooth normals differ from face normals.
    const bent = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
    const p = mesh({ positions: bent, shading: 'flat' });
    expect(p.layout).toMatchObject({ expanded: true, itemCount: 6 });
    const n = attr(p, 'normal').array;
    expect([n[0], n[1], n[2]]).toEqual([0, 0, 1]);
    // All three corners of a triangle share its face normal.
    expect([n[9], n[10], n[11]]).toEqual([n[15], n[16], n[17]]);
    expect(n[11]).toBeCloseTo(1 / Math.sqrt(3), 6);
    expect(p.pickKind).toBe('triangle');
    expect(p.pickCount).toBe(2);
    expect(p.triangleVertices(1)).toEqual([0, 2, 3]);
  });

  it('draws triangles with a missing vertex degenerate', () => {
    const p = new Float32Array([...SQUARE, NaN, 0, 0]);
    const m = mesh({ positions: p, indices: new Uint32Array([0, 1, 2, 0, 2, 4]) });
    expect([...m.object.geometry.getIndex()!.array]).toEqual([0, 1, 2, 0, 0, 0]);
    // Bounds ignore the missing vertex.
    expect(m.object.geometry.boundingBox!.max.x).toBe(1);
  });

  it('places the RTC geometry with the object matrix (float64 offset)', () => {
    const p = mesh({ origin: [1.7e12, 0, 0] });
    p.setTransform({ scaleX: 1e-3, scaleY: 2, scaleZ: 1, offsetX: -1.7e9, offsetY: 0, offsetZ: 3 });
    expect(p.object.scale.toArray()).toEqual([1e-3, 2, 1]);
    // offset + origin · scale, computed in float64.
    expect(p.object.position.x).toBeCloseTo(0, 6);
    expect(p.object.position.z).toBe(3);
  });
});

describe('MeshPrimitive colors', () => {
  it('uniform color is a uniform; per-vertex colors are an attribute', () => {
    const p = mesh({ color: [1, 0, 0, 1] });
    expect(p.object.geometry.getAttribute('color')).toBeUndefined();
    const u = (p.material as ShaderMaterial).uniforms;
    expect(u['uColor']!.value.toArray()).toEqual([1, 0, 0, 1]);
    p.update({ color: new Float32Array(16).fill(0.5) });
    expect(attr(p, 'color').count).toBe(4);
    expect(defines(p)['HC_COLOR']).toBe('');
  });

  it('vertex intensity: shader LUT lookup with domain uniforms relative to the origin', () => {
    const ctx = context();
    const p = mesh(
      {
        intensity: [10, 20, 30, 40],
        colorscale: [
          [0, [0, 0, 0, 1]],
          [1, [1, 1, 1, 1]],
        ],
      },
      ctx,
    );
    expect(defines(p)['HC_INTENSITY']).toBe('');
    expect([...attr(p, 'intensity').array]).toEqual([-15, -5, 5, 15]);
    const u = (p.material as ShaderMaterial).uniforms;
    expect(u['uCRange']!.value.toArray()).toEqual([-15, 15, 0]);
    expect(u['uLut']!.value).not.toBeNull();
    expect(ctx.resources.stats().filter((s) => s.kind === 'texture')).toHaveLength(1);
    p.update({ cmin: 0, cmax: 100, reversescale: true });
    expect(u['uCRange']!.value.toArray()).toEqual([-25, 75, 1]);
    p.dispose();
    expect(ctx.resources.stats()).toHaveLength(0);
  });

  it('cell intensity expands the geometry: one value per triangle', () => {
    const p = mesh({ intensity: [1, 3], intensityMode: 'cell' });
    expect(p.layout.expanded).toBe(true);
    expect([...attr(p, 'intensity').array]).toEqual([-1, -1, -1, 1, 1, 1]);
    // Smooth normals still apply per corner.
    expect(attr(p, 'normal').count).toBe(6);
  });

  it('face colors expand; per-vertex alpha and opacity make it translucent', () => {
    const faces = new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]);
    const p = mesh({ color: [0, 0, 0, 1], faceColor: faces });
    expect(p.layout.expanded).toBe(true);
    expect([...attr(p, 'color').array.subarray(12, 16)]).toEqual([0, 0, 1, 1]);
    expect(p.translucent).toBe(false);
    p.update({ alpha: [1, 1, 0.5, 1] });
    expect(p.translucent).toBe(true);
    expect(p.material.transparent).toBe(true);
    expect(p.material.depthWrite).toBe(false);
    p.update({ alpha: null, opacity: 0.4 });
    expect(p.translucent).toBe(true);
    p.update({ opacity: 1 });
    expect(p.translucent).toBe(false);
  });

  it('depth test and depth write can be set (a layer on a surface already drawn)', () => {
    const p = mesh({});
    expect(p.material.depthTest).toBe(true);
    expect(p.material.depthWrite).toBe(true);
    p.update({ depthTest: false, depthWrite: false });
    expect(p.material.depthTest).toBe(false);
    expect(p.material.depthWrite).toBe(false);
    // `'auto'` follows the translucency again; a forced write survives it.
    p.update({ depthWrite: 'auto', opacity: 0.5 });
    expect(p.material.depthWrite).toBe(false);
    p.update({ depthWrite: true });
    expect(p.material.depthWrite).toBe(true);
  });
});

describe('MeshPrimitive partial updates (E16.3)', () => {
  it('color and intensity updates rewrite only their attribute, in place', () => {
    const p = mesh({ color: new Float32Array(16).fill(1) });
    const geometry = p.object.geometry;
    const position = attr(p, 'position');
    const color = attr(p, 'color');
    const version = position.version;
    p.update({ color: new Float32Array(16).fill(0.25) });
    expect(p.object.geometry).toBe(geometry);
    expect(attr(p, 'color')).toBe(color);
    expect(color.array[0]).toBe(0.25);
    expect(color.version).toBeGreaterThan(0);
    expect(position.version).toBe(version);

    const q = mesh({ intensity: [1, 2, 3, 4] });
    const g2 = q.object.geometry;
    const iv = attr(q, 'intensity');
    q.update({ intensity: [4, 3, 2, 1] });
    expect(q.object.geometry).toBe(g2);
    expect(attr(q, 'intensity')).toBe(iv);
    expect([...iv.array]).toEqual([1.5, 0.5, -0.5, -1.5]);
  });

  it('uniform-only changes keep the geometry and attributes', () => {
    const p = mesh();
    const geometry = p.object.geometry;
    p.update({ opacity: 0.5, lighting: { ambient: 0.3 }, lightposition: [0, 0, 1], clip: null });
    expect(p.object.geometry).toBe(geometry);
    expect((p.material as ShaderMaterial).uniforms['uOpacity']!.value).toBe(0.5);
  });

  it('adding or dropping an attribute moves to a fresh geometry (no leaked GPU buffers)', () => {
    const p = mesh();
    const geometry = p.object.geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    p.update({ alpha: [1, 0.5, 0.5, 1] });
    expect(dispose).toHaveBeenCalled();
    expect(p.object.geometry).not.toBe(geometry);
    expect(attr(p, 'color').count).toBe(4);
    p.update({ alpha: null });
    expect(p.object.geometry.getAttribute('color')).toBeUndefined();
    expect(attr(p, 'position').count).toBe(4);
  });

  it('positions and shading rebuild; normal epsilons recompute computed normals', () => {
    const p = mesh();
    const geometry = p.object.geometry;
    p.update({ shading: 'flat' });
    expect(p.object.geometry).not.toBe(geometry);
    p.update({
      shading: 'smooth',
      normalScale: [0.5, 0.5, 0.5],
      lighting: { vertexnormalsepsilon: 1 },
    });
    // Everything at or below 1 is dropped: zero normals (ambient only).
    expect([...attr(p, 'normal').array.subarray(0, 3)]).toEqual([0, 0, 0]);
  });
});

describe('MeshPrimitive lighting', () => {
  it("sets Plotly's coefficients and a light at lightposition every frame", () => {
    const p = mesh({ lighting: { diffuse: 0.5, specular: 1.5, roughness: 0.3, fresnel: 2 } });
    frame(p, camera());
    const u = (p.material as ShaderMaterial).uniforms;
    expect(u['uK']!.value.toArray()).toEqual([0.5, 1.5, 0.3, 2]);
    expect(u['uAmbient']!.value.toArray().map((v: number) => +v.toFixed(6))).toEqual([
      0.8, 0.8, 0.8,
    ]);
    expect(defines(p)['HC_LIGHTS']).toBe(1);
    const light = u['uLightPos']!.value as Float32Array;
    expect(light[0]).toBeGreaterThan(0);
    expect(light[1]).toBeGreaterThan(0);
  });

  it('uses a rig when set (lights × the trace coefficients)', () => {
    const p = mesh();
    p.setLightRig(
      createLightRig({
        ambient: { intensity: 0.5 },
        directional: [{ position: [1, 0, 0] }, { position: [0, 1, 0] }, { position: [0, 0, 1] }],
      }),
    );
    frame(p, camera());
    expect(defines(p)['HC_LIGHTS']).toBe(3);
    const u = (p.material as ShaderMaterial).uniforms;
    expect(u['uAmbient']!.value.x).toBeCloseTo(0.4);
    p.setLightRig(null);
    frame(p, camera());
    expect(defines(p)['HC_LIGHTS']).toBe(1);
  });

  it("'flat' material is unlit; side and clip set state and defines", () => {
    const p = mesh({
      material: { type: 'flat' },
      side: 'back',
      clip: { min: [0, 0, -1], max: [0.5, 1, 1] },
      origin: [10, 0, 0],
    });
    expect(defines(p)['HC_UNLIT']).toBe('');
    expect(defines(p)['HC_CLIP']).toBe('');
    expect(p.material.side).toBe(BackSide);
    const u = (p.material as ShaderMaterial).uniforms;
    // Clip box relative to the origin.
    expect(u['uClipMin']!.value.toArray()).toEqual([-10, 0, -1]);
    expect(u['uClipMax']!.value.toArray()).toEqual([-9.5, 1, 1]);
  });
});

describe('MeshPrimitive material types (E8.7)', () => {
  it('maps types to three.js materials seeded from Plotly lighting', () => {
    const cases = [
      ['lambert', MeshLambertMaterial],
      ['phong', MeshPhongMaterial],
      ['standard', MeshStandardMaterial],
      ['physical', MeshPhysicalMaterial],
      ['toon', MeshToonMaterial],
    ] as const;
    for (const [type, Class] of cases) {
      const p = mesh({ material: { type }, lighting: { roughness: 0.25 } });
      expect(p.material).toBeInstanceOf(Class);
      if (p.material instanceof MeshStandardMaterial) expect(p.material.roughness).toBe(0.25);
      p.dispose();
    }
    const phong = mesh({ material: { type: 'phong' }, lighting: { roughness: 0.5 } });
    expect((phong.material as MeshPhongMaterial).shininess).toBe(6);
  });

  it('applies params and uses linear colors (intensity mapped on the CPU)', () => {
    const p = mesh({
      material: { type: 'physical', metalness: 0.7, clearcoat: 1, emissive: [1, 0, 0, 1] },
      color: [0.5, 0.5, 0.5, 1],
    });
    const m = p.material as MeshPhysicalMaterial;
    expect(m.metalness).toBe(0.7);
    expect(m.clearcoat).toBe(1);
    expect(m.emissive.r).toBe(1);
    // One sRGB color → the material color (linear), no attribute.
    expect(m.color.r).toBeCloseTo(0.214, 3);
    expect(m.vertexColors).toBe(false);
    p.update({
      intensity: [0, 1, 2, 3],
      colorscale: [
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ],
    });
    expect(m.vertexColors).toBe(true);
    expect(p.object.geometry.getAttribute('intensity')).toBeUndefined();
    const c = attr(p, 'color').array;
    expect([c[0], c[12]]).toEqual([0, 1]);
    // Back to Plotly's model: the shader and the intensity attribute again.
    p.update({ material: null });
    expect(p.material).toBeInstanceOf(ShaderMaterial);
    expect(attr(p, 'intensity').count).toBe(4);
  });

  it('three.js materials clip through an injected chunk', () => {
    const p = mesh({ material: { type: 'lambert' }, clip: { min: [0, 0, 0], max: [1, 1, 1] } });
    const m = p.material;
    expect((m as { defines?: Record<string, unknown> }).defines?.['HC_CLIP']).toBe('');
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <clipping_planes_fragment>',
    };
    m.onBeforeCompile(shader as never, fakeRenderer);
    expect(shader.vertexShader).toContain('vHcLocal = position;');
    expect(shader.fragmentShader).toContain('discard');
    expect(Object.keys(shader.uniforms)).toContain('uClipMin');
  });
});

describe('MeshPrimitive transparency (E2.14)', () => {
  /** Two stacked squares, the lower one first in the index. */
  const STACK = new Float32Array([0, 0, -1, 1, 0, -1, 1, 1, -1, 0, 0, 1, 1, 0, 1, 1, 1, 1]);

  it('sorts a translucent mesh back to front when the view changes', () => {
    const p = new MeshPrimitive(context(), { positions: STACK, opacity: 0.5 });
    const index = p.object.geometry.getIndex()!;
    frame(p, camera(5));
    // Seen from above (+z), the lower triangle (z = −1) is farther: first.
    expect([...index.array]).toEqual([0, 1, 2, 3, 4, 5]);
    const version = index.version;
    frame(p, camera(5));
    expect(index.version).toBe(version); // same view: no re-sort
    frame(p, camera(-5));
    expect([...index.array]).toEqual([3, 4, 5, 0, 1, 2]);
    // Opaque again: the original order comes back.
    p.update({ opacity: 1 });
    expect([...index.array]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('leaves opaque meshes and sortTriangles: false alone', () => {
    const p = new MeshPrimitive(context(), {
      positions: STACK,
      opacity: 0.5,
      sortTriangles: false,
    });
    frame(p, camera(-5));
    expect([...p.object.geometry.getIndex()!.array]).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('MeshPrimitive picking (E2.13)', () => {
  it('pick material: vertex ids by default, triangle ids when expanded', () => {
    const p = mesh();
    expect(p.pickKind).toBe('vertex');
    expect(p.pickCount).toBe(4);
    const handle = p.createPickMaterial();
    handle.prepare({ base: 42, windowWidth: 5, windowHeight: 5, pixelRatio: 1 });
    const m = handle.material;
    expect(m.uniforms['uPickBase']!.value).toBe(42);
    expect(m.defines['PICKING']).toBe('');
    expect(m.defines['HC_PICK_TRIANGLE']).toBeUndefined();
    expect(m.fragmentShader).toContain('holochartEncodePickId(vPickId)');
    p.update({ pick: 'triangle', opacity: 0.5 });
    handle.prepare({ base: 0, windowWidth: 5, windowHeight: 5, pixelRatio: 1 });
    expect(m.defines['HC_PICK_TRIANGLE']).toBe('');
    expect(p.pickCount).toBe(2);
    // Depth state mirrors the visible pass.
    expect(m.depthWrite).toBe(false);
    expect(m.transparent).toBe(true);
    handle.dispose();
  });

  it('hooks are spliced into the shaders (vertex hooks into the pick pass too)', () => {
    const p = mesh({
      hooks: {
        uniforms: { uTint: { value: 0.5 } },
        vertexDecl: 'uniform float uLift;',
        vertex: 'gl_Position.y += 0.0;',
        fragmentDecl: 'uniform float uTint;',
        color: 'color.rgb *= uTint;',
      },
    });
    const m = p.material as ShaderMaterial;
    expect(m.fragmentShader).toContain('color.rgb *= uTint;');
    expect(m.fragmentShader).not.toContain('// @mesh-color');
    expect(m.uniforms['uTint']!.value).toBe(0.5);
    const handle = p.createPickMaterial();
    handle.prepare({ base: 0, windowWidth: 1, windowHeight: 1, pixelRatio: 1 });
    expect(handle.material.vertexShader).toContain('gl_Position.y += 0.0;');
    expect(handle.material.fragmentShader).not.toContain('uTint;');
  });
});

describe('MeshPrimitive lifecycle', () => {
  it('invalidates on changes and releases everything on dispose', () => {
    const ctx = context();
    const p = mesh({ intensity: [0, 1, 2, 3] }, ctx);
    expect(ctx.invalidate).toHaveBeenCalled();
    const geometry = p.object.geometry;
    const spy = vi.spyOn(geometry, 'dispose');
    p.dispose();
    expect(spy).toHaveBeenCalled();
    expect(ctx.resources.stats()).toHaveLength(0);
  });

  it('matrix of a transformed mesh maps RTC positions into world space', () => {
    const p = mesh({ origin: [100, 0, 0] });
    p.setTransform({ scaleX: 2, scaleY: 1, scaleZ: 1, offsetX: -200, offsetY: 0, offsetZ: 0 });
    p.object.updateMatrixWorld();
    // RTC (1, 0, 0) = data (101, 0, 0) → world 2 · 101 − 200 = 2.
    const v = new Vector4(1, 0, 0, 1).applyMatrix4(new Matrix4().copy(p.object.matrixWorld));
    expect(v.x).toBe(2);
  });
});
