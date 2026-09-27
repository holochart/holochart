/**
 * A minimal PNG encoder for `imshow`'s `binaryString` output (plotly.py's
 * `image_array_to_data_uri`): 8-bit grayscale, gray + alpha, RGB or RGBA pixels in one IDAT chunk,
 * as a zlib stream of stored (uncompressed) deflate blocks. No dependencies and no `Buffer`, so it
 * runs the same in browsers and Node; the images are larger than a compressing encoder's, which
 * matters little next to the JSON of the same pixels.
 */

/** CRC-32 (ISO 3309, as PNG chunks use) lookup table, built on first use. */
let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = (crcTable[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 checksum of a zlib stream's uncompressed data. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552 bytes is the most that can be summed before the 32-bit sums need reducing.
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) {
      a += bytes[i] as number;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Largest payload of a stored deflate block. */
const STORED_BLOCK = 65535;

/** A zlib stream (RFC 1950) of `data` in stored deflate blocks (RFC 1951 §3.2.4). */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / STORED_BLOCK));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78; // deflate, 32 KiB window
  out[1] = 0x01; // no dictionary, fastest level; (0x78 << 8 | 0x01) % 31 === 0
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * STORED_BLOCK;
    const len = Math.min(STORED_BLOCK, data.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0; // BFINAL, BTYPE = 00
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  new DataView(out.buffer).setUint32(o, adler32(data));
  return out;
}

/** PNG color type per number of channels. */
const COLOR_TYPES: Readonly<Record<number, number>> = { 1: 0, 2: 4, 3: 2, 4: 6 };

/**
 * Encode 8-bit pixels as a PNG file.
 *
 * @param pixels Row-major samples, `channels` per pixel (1 gray, 2 gray + alpha, 3 RGB, 4 RGBA).
 * @throws {Error} For other channel counts, empty images or a `pixels` length that does not match.
 */
export function encodePNG(
  width: number,
  height: number,
  channels: number,
  pixels: ArrayLike<number>,
): Uint8Array {
  const colorType = COLOR_TYPES[channels];
  if (colorType === undefined) throw new Error(`encodePNG: ${channels} channels (expected 1–4).`);
  if (!(width > 0 && height > 0) || pixels.length !== width * height * channels) {
    throw new Error(`encodePNG: ${pixels.length} samples for ${width}×${height}×${channels}.`);
  }
  // Each scanline starts with filter type 0 (none).
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) raw[row + i] = pixels[y * stride + i] as number;
  }
  const idat = zlibStored(raw);

  const chunks: [string, Uint8Array][] = [
    ['IHDR', new Uint8Array(13)],
    ['IDAT', idat],
    ['IEND', new Uint8Array(0)],
  ];
  const ihdr = new DataView((chunks[0] as [string, Uint8Array])[1].buffer);
  ihdr.setUint32(0, width);
  ihdr.setUint32(4, height);
  ihdr.setUint8(8, 8); // bit depth
  ihdr.setUint8(9, colorType);
  // Compression, filter and interlace methods: 0.

  const size = 8 + chunks.reduce((n, [, data]) => n + 12 + data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8;
  for (const [type, data] of chunks) {
    view.setUint32(o, data.length);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = type.charCodeAt(i);
    out.set(data, o + 8);
    view.setUint32(o + 8 + data.length, crc32(out, o + 4, o + 8 + data.length));
    o += 12 + data.length;
  }
  return out;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (RFC 4648, padded) of `bytes`, without `btoa` or `Buffer`. */
export function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const n = (a << 16) | (b << 8) | c;
    chunk +=
      BASE64.charAt(n >>> 18) +
      BASE64.charAt((n >>> 12) & 63) +
      (i + 1 < bytes.length ? BASE64.charAt((n >>> 6) & 63) : '=') +
      (i + 2 < bytes.length ? BASE64.charAt(n & 63) : '=');
    // Join in pieces so long images do not build one huge rope of tiny strings.
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/** A PNG of 8-bit pixels as a `data:image/png;base64,…` URI (see {@link encodePNG}). */
export function pngDataURI(
  width: number,
  height: number,
  channels: number,
  pixels: ArrayLike<number>,
): string {
  return `data:image/png;base64,${base64(encodePNG(width, height, channels, pixels))}`;
}
