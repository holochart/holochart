import { afterEach, describe, expect, it, vi } from 'vitest';
import { globeModule, loadGlobe } from './globe-loader.ts';

// These run in order: the chunk loads once per module instance.
describe('the globe chunk', () => {
  it('is not loaded until a figure draws a globe', () => {
    expect(globeModule()).toBeNull();
  });

  it('loads once, for every caller, and is handed what it needs', async () => {
    const first = loadGlobe();
    const second = loadGlobe();
    expect(second).toBe(first);
    const globe = await first;
    expect(globeModule()).toBe(globe);
    expect(await loadGlobe()).toBe(globe);
    for (const name of [
      'buildSphereMesh',
      'buildSphereShell',
      'buildSphereLines',
      'buildArcs',
      'buildPrisms',
    ] as const) {
      expect(typeof globe[name], name).toBe('function');
    }
    // The stream sink and the triangulation are in place: a polygon becomes triangles.
    const mesh = globe.buildSphereMesh({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ],
      ],
    });
    expect(mesh.triangleCount).toBeGreaterThan(0);
  });
});

describe('a failed load of the globe chunk', () => {
  afterEach(() => {
    vi.doUnmock('./globe/index.ts');
    vi.resetModules();
  });

  it('rejects with an error that says so, and is tried again the next time', async () => {
    vi.resetModules();
    vi.doMock('./globe/index.ts', () => {
      throw new Error('offline');
    });
    const fresh = await import('./globe-loader.ts');
    const error = await fresh.loadGlobe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/3D globe \('globe3d'\)/);
    expect((error as Error).cause).toBeDefined();
    expect(fresh.globeModule()).toBeNull();
    // A second failure is a second attempt, not the first one's promise.
    await expect(fresh.loadGlobe()).rejects.toThrow(/could not load|Could not load/);
    expect(fresh.globeModule()).toBeNull();

    // The chunk is reachable again: the same loader now loads it.
    vi.doUnmock('./globe/index.ts');
    const globe = await fresh.loadGlobe();
    expect(typeof globe.buildSphereMesh).toBe('function');
    expect(fresh.globeModule()).toBe(globe);
  });
});
