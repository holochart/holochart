import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { customShader } from './custom.ts';
import { textures } from './custom-markers.ts';
import { MARKER_FRAGMENT, MARKER_VERTEX } from './markers.glsl.ts';
import { createMarkers } from './markers.ts';
import { createMarkerMatrix, MARKER_MATRIX_VERTEX } from './matrix.ts';
import { symbols } from './symbols.ts';

const CELL = 128;

/** A 2D context that paints a centered square for fills (no real canvas in node), as in custom.test.ts. */
class FakeContext {
  readonly data = new Uint8ClampedArray(CELL * CELL * 4);
  fillStyle = '';
  setTransform(): void {}
  fill(): void {
    for (let y = 32; y < 96; y++) {
      for (let x = 32; x < 96; x++) this.data.set([255, 255, 255, 255], (y * CELL + x) * 4);
    }
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: this.data };
  }
}

class FakeCanvas {
  getContext(): FakeContext {
    return new FakeContext();
  }
}

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

const PICK_STATE = { base: 0, windowWidth: 4, windowHeight: 4, pixelRatio: 1 };

beforeAll(() => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  vi.stubGlobal('Path2D', class {});
  symbols.register('s-flag', { path: 'M4 2v20M4 3h14l-3 5 3 5H4z' });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe('marker shaders with custom symbols', () => {
  it('goes back to the plain shaders when the set stops drawing custom symbols', async () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1], symbol: 's-flag' });
    await m.ready;
    expect(m.material.vertexShader).toBe(customShader(MARKER_VERTEX, false));
    expect(m.material.fragmentShader).toBe(customShader(MARKER_FRAGMENT, true));
    expect(m.material.vertexShader).not.toBe(MARKER_VERTEX);
    const version = m.material.version;

    m.update({ symbol: 'square' });

    expect(m.material.vertexShader).toBe(MARKER_VERTEX);
    expect(m.material.fragmentShader).toBe(MARKER_FRAGMENT);
    expect(m.material.version).toBeGreaterThan(version);
    m.dispose();
  });

  it('keeps the custom shaders while any item still draws a custom symbol', async () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1], symbol: 's-flag' });
    await m.ready;
    const custom = m.material.vertexShader;
    m.patch(0, 1, { symbol: 'square' });
    expect(m.material.vertexShader).toBe(custom);
    m.dispose();
  });

  it('picks custom symbols with the shaders that draw them', async () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1], symbol: 's-flag' });
    const handle = m.createPickMaterial();
    const pick = handle.material;
    await m.ready;
    const version = pick.version;

    handle.prepare(PICK_STATE);

    expect(pick.vertexShader).toBe(customShader(MARKER_VERTEX, false));
    expect(pick.fragmentShader).toBe(customShader(MARKER_FRAGMENT, true));
    expect(pick.defines).toHaveProperty('PICKING');
    expect(pick.version).toBeGreaterThan(version);
    // The atlases reach the pick pass through the shared uniforms.
    expect(pick.uniforms.uCustomSdf!.value).toBe(textures().sdf);
    expect(pick.uniforms.uCustomMeta!.value).toBe(textures().meta);

    // Back to built-in symbols: the pick material follows on its next use.
    m.update({ symbol: 'circle' });
    handle.prepare(PICK_STATE);
    expect(pick.vertexShader).toBe(MARKER_VERTEX);
    expect(pick.fragmentShader).toBe(MARKER_FRAGMENT);
    // Nothing changed since: no recompile.
    const settled = pick.version;
    handle.prepare(PICK_STATE);
    expect(pick.version).toBe(settled);
    handle.dispose();
    m.dispose();
  });

  it('switches scatter-matrix cells to the custom shaders and back', async () => {
    const matrix = createMarkerMatrix(
      context(),
      [
        [0, 1],
        [1, 2],
      ],
      { symbol: 's-flag' },
    );
    const cell = matrix.createCell(0, 1);
    await cell.ready;
    cell.relink(); // what every render does first
    expect(cell.material.vertexShader).toContain('uCustomMeta');
    expect(cell.material.vertexShader).toContain('in float aX;');
    expect(cell.material.fragmentShader).toBe(customShader(MARKER_FRAGMENT, true));
    const version = cell.material.version;

    matrix.update({ symbol: 'square' });

    expect(cell.material.vertexShader).toBe(MARKER_MATRIX_VERTEX);
    expect(cell.material.fragmentShader).toBe(MARKER_FRAGMENT);
    expect(cell.material.version).toBeGreaterThan(version);
    matrix.dispose();
  });
});
