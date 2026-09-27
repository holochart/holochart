/**
 * A strict decoder for the PNGs of `../png.ts` (8-bit, one IDAT of stored deflate blocks, filter
 * type 0), checking the signature, every CRC, the zlib header and Adler-32 independently of the
 * encoder. Test-only: not exported from the package index; import it only from `*.test.ts` files.
 */

function fail(message: string): never {
  throw new Error(`decodePNG: ${message}`);
}

/** Bitwise CRC-32, independent of the encoder's table. */
function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Chunks of a PNG file, checking the signature and every CRC. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  if (SIGNATURE.some((b, i) => png[i] !== b)) fail('bad signature.');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  for (let o = 8; o < png.length;) {
    const length = view.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + length);
    if (view.getUint32(o + 8 + length) !== crc(png.subarray(o + 4, o + 8 + length))) {
      fail(`bad CRC in ${type}.`);
    }
    out.push({ type, data });
    o += 12 + length;
  }
  return out;
}

/** Inflate a zlib stream of stored blocks, checking the header and Adler-32. */
export function inflateStored(z: Uint8Array): { data: Uint8Array; blocks: number } {
  const header = ((z[0] as number) << 8) | (z[1] as number);
  if (header % 31 !== 0 || ((z[0] as number) & 0x0f) !== 8) fail('bad zlib header.');
  const parts: Uint8Array[] = [];
  let o = 2;
  for (;;) {
    const block = z[o] as number;
    if ((block & 0b110) !== 0) fail('not a stored block.');
    const len = (z[o + 1] as number) | ((z[o + 2] as number) << 8);
    const nlen = (z[o + 3] as number) | ((z[o + 4] as number) << 8);
    if (nlen !== (~len & 0xffff)) fail('bad NLEN.');
    parts.push(z.subarray(o + 5, o + 5 + len));
    o += 5 + len;
    if (block & 1) break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of parts) {
    out.set(p, k);
    k += p.length;
  }
  const view = new DataView(z.buffer, z.byteOffset, z.byteLength);
  if (view.getUint32(o) !== adler(out)) fail('bad Adler-32.');
  if (o + 4 !== z.length) fail('trailing bytes after the zlib stream.');
  return { data: out, blocks: parts.length };
}

/** A decoded PNG: size, color type and samples (row-major, channels interleaved). */
export interface DecodedPNG {
  width: number;
  height: number;
  colorType: number;
  /** Stored blocks in the zlib stream. */
  blocks: number;
  pixels: number[];
}

/** Decode a PNG from `encodePNG`. */
export function decodePNG(png: Uint8Array): DecodedPNG {
  const list = chunks(png);
  if (list.map((c) => c.type).join() !== 'IHDR,IDAT,IEND') fail('unexpected chunks.');
  const ihdr = list[0]?.data as Uint8Array;
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  if (ihdr[8] !== 8) fail('bit depth is not 8.');
  const colorType = ihdr[9] as number;
  const channels = ({ 0: 1, 4: 2, 2: 3, 6: 4 } as Record<number, number>)[colorType];
  if (channels === undefined) fail(`color type ${colorType}.`);
  const idat = list[1]?.data as Uint8Array;
  const { data: raw, blocks } = inflateStored(idat);
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) fail('wrong data size.');
  const pixels: number[] = [];
  for (let y = 0; y < height; y++) {
    if (raw[y * (stride + 1)] !== 0) fail('filter type is not 0.');
    pixels.push(...raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
  }
  return { width, height, colorType, blocks, pixels };
}

/** Bytes of a base64 string (via `atob`, which browsers and Node both have). */
export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** Decode a `data:image/png;base64,…` URI. */
export function decodeDataURI(uri: string): DecodedPNG {
  const prefix = 'data:image/png;base64,';
  if (!uri.startsWith(prefix)) fail(`not a PNG data URI: ${uri.slice(0, 30)}…`);
  return decodePNG(fromBase64(uri.slice(prefix.length)));
}
