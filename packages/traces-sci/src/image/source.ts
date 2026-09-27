/**
 * `image.source` (plan E11.3): base64 data URIs only, as plotly.js accepts (`image/defaults.js`
 * drops anything else). Their pixel size is read synchronously from the encoded header — PNG, GIF,
 * JPEG, WebP and BMP — so calc knows the image's extent before it is decoded (Plotly uses
 * `probe-image-size` the same way). Decoding to RGBA pixels (for the texture and pixel hover) is
 * asynchronous and cached per source.
 */
import type { RasterPixels } from '@mk7s/holochart-render';

/** Plotly's `dataUri` check. */
const DATA_URI = /^data:image\/\w+;base64,/;

/** Whether `v` is a source the image trace accepts: a base64 image data URI. */
export function isImageDataUri(v: unknown): v is string {
  return typeof v === 'string' && DATA_URI.test(v);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = /* @__PURE__ */ (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  // URL-safe variants.
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Decode up to `maxBytes` bytes of base64 text (whitespace skipped, stops at padding). */
export function decodeBase64(text: string, maxBytes = Infinity): Uint8Array {
  const out = new Uint8Array(Math.min(Math.floor((text.length * 3) / 4), maxBytes));
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length && n < out.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 61) break; // '='
    const v = code < 128 ? B64_INDEX[code]! : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

function be16(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!;
}
function le16(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8);
}
function be32(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
}
function le32(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24) | 0;
}

/** Pixel size from the first bytes of an encoded image, or undefined for unknown formats. */
export function imageSizeFromBytes(b: Uint8Array): { width: number; height: number } | undefined {
  const ascii = (i: number, s: string): boolean =>
    [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0));
  // PNG: signature, then the IHDR chunk.
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 'PNG') && ascii(12, 'IHDR')) {
    return { width: be32(b, 16), height: be32(b, 20) };
  }
  if (b.length >= 10 && ascii(0, 'GIF8')) return { width: le16(b, 6), height: le16(b, 8) };
  if (b.length >= 26 && ascii(0, 'BM')) {
    return { width: Math.abs(le32(b, 18)), height: Math.abs(le32(b, 22)) };
  }
  if (b.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8 ')) return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    if (ascii(12, 'VP8L')) {
      return {
        width: 1 + (((b[22]! & 0x3f) << 8) | b[21]!),
        height: 1 + (((b[24]! & 0xf) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)),
      };
    }
    if (ascii(12, 'VP8X')) {
      return {
        width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
      };
    }
    return undefined;
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined;
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (sof) return { width: be16(b, i + 7), height: be16(b, i + 5) };
      i += 2 + be16(b, i + 2);
    }
  }
  return undefined;
}

/** Bytes of the header decoded for sizing (JPEG frames can follow large metadata segments). */
const PROBE_BYTES = 256 * 1024;

const sizes = /* @__PURE__ */ new Map<string, { width: number; height: number } | undefined>();
const MAX_SIZES = 64;

/** Pixel size of a data URI image (cached), or undefined when it can't be read. */
export function dataUriImageSize(uri: string): { width: number; height: number } | undefined {
  if (sizes.has(uri)) return sizes.get(uri);
  const comma = uri.indexOf(',');
  const size = imageSizeFromBytes(decodeBase64(uri.slice(comma + 1), PROBE_BYTES));
  sizes.set(uri, size);
  if (sizes.size > MAX_SIZES) sizes.delete(sizes.keys().next().value!);
  return size;
}

/** Decoded pixels per source (most recent last), for the texture and pixel hover. */
const decoded = /* @__PURE__ */ new Map<string, RasterPixels>();
const MAX_DECODED = 16;

/** The decoded pixels of a source, if it has been decoded (see {@link decodeImageSource}). */
export function decodedPixels(uri: string): RasterPixels | undefined {
  return decoded.get(uri);
}

/** Remember decoded pixels (tests, or a custom decoder). */
export function rememberPixels(uri: string, pixels: RasterPixels): void {
  decoded.delete(uri);
  decoded.set(uri, pixels);
  if (decoded.size > MAX_DECODED) decoded.delete(decoded.keys().next().value!);
}

/**
 * Decode a data URI to straight-alpha RGBA pixels through the browser's image decoder and a 2D
 * canvas (cached). Resolves undefined where that isn't available (no DOM) or on failure.
 */
export async function decodeImageSource(uri: string): Promise<RasterPixels | undefined> {
  const cached = decoded.get(uri);
  if (cached) return cached;
  if (typeof Image === 'undefined' || typeof document === 'undefined') return undefined;
  try {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || width === 0 || height === 0) return undefined;
    ctx.drawImage(img, 0, 0);
    const pixels = { data: ctx.getImageData(0, 0, width, height).data, width, height };
    rememberPixels(uri, pixels);
    return pixels;
  } catch {
    return undefined;
  }
}
