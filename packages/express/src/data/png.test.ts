/** The PNG encoder behind `imshow`'s `binaryString`: file structure, checksums and base64. */
import { describe, expect, it } from 'vitest';
import { decodeDataURI, decodePNG, fromBase64 } from './__testing__/png-decode.ts';
import { base64, encodePNG, pngDataURI } from './png.ts';

describe('encodePNG', () => {
  it('writes a valid 8-bit PNG per channel count', () => {
    for (const [channels, colorType] of [
      [1, 0],
      [2, 4],
      [3, 2],
      [4, 6],
    ] as const) {
      const pixels = Array.from({ length: 3 * 2 * channels }, (_, i) => (i * 37) % 256);
      const decoded = decodePNG(encodePNG(3, 2, channels, pixels));
      expect(decoded).toEqual({ width: 3, height: 2, colorType, blocks: 1, pixels });
    }
  });

  it('splits the data into stored blocks of at most 65535 bytes', () => {
    const pixels = Array.from({ length: 200 * 150 * 3 }, (_, i) => i % 251);
    const decoded = decodePNG(encodePNG(200, 150, 3, pixels));
    expect(decoded.blocks).toBe(2);
    expect(decoded.pixels).toEqual(pixels);
  });

  it('rejects other channel counts and mismatched sizes', () => {
    expect(() => encodePNG(1, 1, 5, [1, 2, 3, 4, 5])).toThrow(/channels/);
    expect(() => encodePNG(2, 2, 3, [1, 2, 3])).toThrow(/samples/);
    expect(() => encodePNG(0, 0, 3, [])).toThrow(/samples/);
  });
});

describe('base64', () => {
  it('matches btoa, with padding', () => {
    for (let n = 0; n < 12; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + n) % 256);
      expect(base64(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
    }
    const long = Uint8Array.from({ length: 20000 }, (_, i) => (i * 31) % 256);
    expect(fromBase64(base64(long))).toEqual(long);
  });

  it('pngDataURI is a PNG data URI', () => {
    const uri = pngDataURI(1, 1, 3, [255, 0, 0]);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(decodeDataURI(uri).pixels).toEqual([255, 0, 0]);
  });
});
