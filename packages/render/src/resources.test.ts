import { BufferGeometry, DataTexture, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from './resources.ts';

describe('createResourceManager', () => {
  it('creates once and shares by key', () => {
    const rm = createResourceManager();
    const create = vi.fn(() => new BufferGeometry());
    const a = rm.acquire('quad', create);
    const b = rm.acquire('quad', create);
    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
    expect(rm.stats()).toEqual([{ key: 'quad', kind: 'geometry', refs: 2 }]);
  });

  it('disposes when the last reference is released', () => {
    const rm = createResourceManager();
    const tex = rm.acquire('lut', () => new DataTexture());
    const dispose = vi.spyOn(tex, 'dispose');
    rm.acquire('lut', () => new DataTexture());
    rm.release('lut');
    expect(dispose).not.toHaveBeenCalled();
    rm.release('lut');
    expect(dispose).toHaveBeenCalledOnce();
    expect(rm.stats()).toEqual([]);
  });

  it('classifies kinds and disposes everything on disposeAll', () => {
    const rm = createResourceManager();
    const mat = rm.acquire('m', () => new MeshBasicMaterial());
    const dispose = vi.spyOn(mat, 'dispose');
    rm.acquire('t', () => new DataTexture());
    expect(rm.stats().map((s) => s.kind)).toEqual(['material', 'texture']);
    rm.disposeAll();
    expect(dispose).toHaveBeenCalledOnce();
    expect(rm.stats()).toEqual([]);
  });

  it('ignores releases of unknown keys', () => {
    const rm = createResourceManager();
    expect(() => rm.release('missing')).not.toThrow();
  });
});
