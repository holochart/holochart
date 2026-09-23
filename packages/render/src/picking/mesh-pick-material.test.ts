import {
  BoxGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { describe, expect, it } from 'vitest';
import { MeshPickMaterial, effectiveMeshElement, meshPickCount } from './mesh-pick-material.ts';

const state = { base: 42, windowWidth: 1, windowHeight: 1, pixelRatio: 1 };

describe('mesh pick element resolution', () => {
  const indexed = new Mesh(new PlaneGeometry(1, 1, 2, 2), new MeshBasicMaterial());
  const flat = new Mesh(new PlaneGeometry(1, 1, 2, 2).toNonIndexed(), new MeshBasicMaterial());
  const instanced = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 6);

  it('falls back where WebGL2 cannot provide the element', () => {
    expect(effectiveMeshElement(indexed, 'triangle')).toBe('vertex');
    expect(effectiveMeshElement(flat, 'triangle')).toBe('triangle');
    expect(effectiveMeshElement(indexed, 'instance')).toBe('object');
    expect(effectiveMeshElement(instanced, 'instance')).toBe('instance');
  });

  it('sizes id ranges per element', () => {
    expect(meshPickCount(indexed, 'object')).toBe(1);
    expect(meshPickCount(indexed, 'vertex')).toBe(9);
    expect(meshPickCount(indexed, 'triangle')).toBe(9); // vertex fallback
    expect(meshPickCount(flat, 'triangle')).toBe(8);
    expect(meshPickCount(flat, 'vertex')).toBe(24);
    instanced.count = 4;
    expect(meshPickCount(instanced, 'instance')).toBe(4);
  });
});

describe('MeshPickMaterial', () => {
  it('writes the base id and mirrors depth/side/visibility of the source', () => {
    const source = new MeshBasicMaterial({
      side: DoubleSide,
      depthWrite: false,
      transparent: true,
    });
    const mesh = new Mesh(new BoxGeometry(), source);
    const pick = new MeshPickMaterial(mesh, 'object');
    pick.prepare(state);
    const m = pick.material;
    expect(m.uniforms.uPickBase!.value).toBe(42);
    expect(m.side).toBe(DoubleSide);
    expect(m.depthWrite).toBe(false);
    expect(m.transparent).toBe(true);
    expect(m.colorWrite).toBe(true);
    source.visible = false;
    source.wireframe = true;
    pick.prepare(state);
    expect(m.visible).toBe(false);
    expect(m.wireframe).toBe(true);
    pick.dispose();
  });

  it('switches element defines when the geometry or mode changes', () => {
    const mesh = new Mesh(new PlaneGeometry(1, 1, 2, 2).toNonIndexed(), new MeshBasicMaterial());
    const pick = new MeshPickMaterial(mesh, 'triangle');
    expect(pick.material.defines).toHaveProperty('PICK_TRIANGLE');
    mesh.geometry = new PlaneGeometry(1, 1, 2, 2); // indexed now
    pick.prepare(state);
    expect(pick.material.defines).toHaveProperty('PICK_VERTEX');
    expect(pick.material.defines).not.toHaveProperty('PICK_TRIANGLE');
    pick.setElement('object');
    pick.prepare(state);
    expect(Object.keys(pick.material.defines)).toEqual([]);
  });

  it('builds depth-only occluders', () => {
    const pick = new MeshPickMaterial(new Mesh(new BoxGeometry()), 'vertex', true);
    pick.prepare(state);
    expect(pick.material.colorWrite).toBe(false);
    expect(Object.keys(pick.material.defines)).toEqual(['PICK_OCCLUDER']);
  });
});
