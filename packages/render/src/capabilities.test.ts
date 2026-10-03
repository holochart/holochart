import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSUMED_GPU_CAPABILITIES, fitsTexture, readGpuCapabilities } from './capabilities.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readGpuCapabilities', () => {
  it('reads the 2D limit from three and the 3D limit from the context', () => {
    const gl = { MAX_3D_TEXTURE_SIZE: 0x8073, getParameter: vi.fn(() => 512) };
    const caps = readGpuCapabilities({
      capabilities: { maxTextureSize: 16384 } as never,
      getContext: () => gl as never,
    });
    expect(caps).toEqual({ maxTextureSize: 16384, max3DTextureSize: 512 });
    expect(gl.getParameter).toHaveBeenCalledWith(0x8073);
  });

  it('assumes the usual limits for a renderer that cannot say, or a lost context', () => {
    expect(readGpuCapabilities({})).toEqual(ASSUMED_GPU_CAPABILITIES);
    const lost = {
      MAX_3D_TEXTURE_SIZE: 0x8073,
      getParameter: () => null,
    };
    expect(
      readGpuCapabilities({ capabilities: {} as never, getContext: () => lost as never }),
    ).toEqual(ASSUMED_GPU_CAPABILITIES);
  });
});

describe('fitsTexture', () => {
  const caps = { maxTextureSize: 2048, max3DTextureSize: 256 };

  it('accepts textures up to the limit on every side', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(fitsTexture(caps, 'a', 2048, 2048)).toBe(true);
    expect(fitsTexture(caps, 'a', 256, 256, 256)).toBe(true);
    // Without capabilities: the assumed limits.
    expect(fitsTexture(undefined, 'a', 4096, 4096)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses larger ones and warns once per message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(fitsTexture(caps, 'test grid', 2049, 10)).toBe(false);
    expect(fitsTexture(caps, 'test grid', 2049, 10)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      "[holochart] test grid: 2049×10 is larger than this GPU's textures (2048 per side); not drawn.",
    );
    // 3D textures have their own limit.
    expect(fitsTexture(caps, 'test volume', 300, 20, 20)).toBe(false);
    expect(warn.mock.calls[1]![0]).toContain('300×20×20');
    expect(warn.mock.calls[1]![0]).toContain('(256 per side)');
  });
});
