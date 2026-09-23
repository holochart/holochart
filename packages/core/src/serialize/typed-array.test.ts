import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TypedArray } from '../schema/types.ts';
import {
  base64ToBytes,
  bytesToBase64,
  decodeTypedArray,
  dtypeOf,
  encodeTypedArray,
  encodeTypedMatrix,
  HOST_LITTLE_ENDIAN,
  isTypedArraySpec,
  littleEndianBytes,
} from './typed-array.ts';

/** Reference base64 via the platform's `btoa` (independent of the codec under test). */
function refBase64(bytes: ArrayBuffer | Uint8Array | readonly number[]): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Element-wise `Object.is` equality plus same constructor (NaN, -0 aware). */
function sameTyped(a: unknown, b: TypedArray): void {
  expect((a as object).constructor).toBe(b.constructor);
  const arr = a as TypedArray;
  expect(arr.length).toBe(b.length);
  for (let i = 0; i < b.length; i++) expect(Object.is(arr[i], b[i])).toBe(true);
}

/** Base64 of little-endian bytes written through a DataView (independent of the codec). */
function le(
  values: readonly number[],
  set: (dv: DataView, off: number, v: number) => void,
  size: number,
): string {
  const dv = new DataView(new ArrayBuffer(values.length * size));
  values.forEach((v, i) => set(dv, i * size, v));
  return refBase64(dv.buffer);
}

const SPECIAL = [NaN, -0, 0, Infinity, -Infinity, 1.5, -2.25, Number.MAX_VALUE, Number.MIN_VALUE];

describe('base64', () => {
  it('matches Node for every length remainder', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), (bytes) => {
        const b64 = bytesToBase64(bytes);
        expect(b64).toBe(refBase64(bytes));
        expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
      }),
      { numRuns: 200 },
    );
  });

  it('handles long inputs (chunked output)', () => {
    const bytes = new Uint8Array(30_000).map((_, i) => (i * 31) & 255);
    expect(bytesToBase64(bytes)).toBe(refBase64(bytes));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('decodes unpadded, URL-safe and whitespace-broken input', () => {
    expect(Array.from(base64ToBytes('+/8'))).toEqual([251, 255]);
    expect(Array.from(base64ToBytes('-_8'))).toEqual([251, 255]);
    expect(Array.from(base64ToBytes('AQ ID\nBA=='))).toEqual([1, 2, 3, 4]);
    expect(base64ToBytes('').length).toBe(0);
  });

  it('rejects invalid characters and lengths', () => {
    expect(() => base64ToBytes('AB$D')).toThrow(/unexpected character/);
    expect(() => base64ToBytes('AB=D')).toThrow(/unexpected character/);
    expect(() => base64ToBytes('ABCDE')).toThrow(/bad length/);
    expect(() => base64ToBytes('AAé=')).toThrow(/unexpected character/);
  });
});

describe('encodeTypedArray / decodeTypedArray', () => {
  const cases: [string, TypedArray][] = [
    ['f8', Float64Array.from(SPECIAL)],
    ['f4', Float32Array.from(SPECIAL)],
    ['i4', Int32Array.of(-2147483648, -1, 0, 1, 2147483647)],
    ['u4', Uint32Array.of(0, 1, 4294967295)],
    ['i2', Int16Array.of(-32768, -1, 0, 32767)],
    ['u2', Uint16Array.of(0, 65535, 258)],
    ['i1', Int8Array.of(-128, -1, 0, 127)],
    ['u1', Uint8Array.of(0, 1, 255)],
    ['u1c', Uint8ClampedArray.of(0, 128, 255)],
  ];

  it.each(cases)('round-trips %s bit-exactly', (dtype, arr) => {
    const spec = encodeTypedArray(arr);
    expect(spec.dtype).toBe(dtype);
    expect(dtypeOf(arr)).toBe(dtype);
    expect(spec).not.toHaveProperty('shape');
    const back = JSON.parse(JSON.stringify(spec)) as typeof spec;
    sameTyped(decodeTypedArray(back), arr);
  });

  it.each(cases)('round-trips empty %s arrays', (_dtype, arr) => {
    const empty = new (arr.constructor as new (n: number) => TypedArray)(0);
    const spec = encodeTypedArray(empty);
    expect(spec.bdata).toBe('');
    sameTyped(decodeTypedArray(spec), empty);
  });

  it('writes little-endian bytes', () => {
    expect(encodeTypedArray(Float64Array.of(1, 2)).bdata).toBe('AAAAAAAA8D8AAAAAAAAAQA==');
    expect(encodeTypedArray(Uint16Array.of(0x0102)).bdata).toBe(refBase64([0x02, 0x01]));
  });

  it('encodes only the bytes of a view with a nonzero byteOffset', () => {
    const whole = Float64Array.of(10, 11, 12, 13, 14);
    const view = whole.subarray(1, 3);
    expect(view.byteOffset).toBe(8);
    const spec = encodeTypedArray(view);
    expect(spec.bdata).toBe(encodeTypedArray(Float64Array.of(11, 12)).bdata);
    sameTyped(decodeTypedArray(spec), Float64Array.of(11, 12));
    const bytes = new Uint8Array(new ArrayBuffer(16), 3, 6);
    bytes.set([1, 2, 3, 4, 5, 6]);
    expect(encodeTypedArray(bytes).bdata).toBe(refBase64([1, 2, 3, 4, 5, 6]));
  });

  it('byte-swaps on big-endian hosts', () => {
    const arr = Uint16Array.of(0x0102, 0x0304);
    const hostBytes = Array.from(new Uint8Array(arr.buffer));
    const swapped = Array.from(littleEndianBytes(arr, !HOST_LITTLE_ENDIAN));
    expect(swapped).toEqual([hostBytes[1], hostBytes[0], hostBytes[3], hostBytes[2]]);
    // Single-byte elements have no order to swap.
    expect(Array.from(littleEndianBytes(Int8Array.of(-1, 2), false))).toEqual([255, 2]);
    // A "big-endian host" decoding what a "big-endian host" encoded gets its values back.
    const bdata = bytesToBase64(littleEndianBytes(arr, false));
    const back = decodeTypedArray({ dtype: 'u2', bdata }, false) as Uint16Array;
    expect(Array.from(littleEndianBytes(back, false))).toEqual(
      Array.from(littleEndianBytes(arr, false)),
    );
  });
});

describe('decoding Plotly-encoded specs', () => {
  it('reads f8 [1, 2]', () => {
    sameTyped(
      decodeTypedArray({ dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQA==' }),
      Float64Array.of(1, 2),
    );
  });

  it('reads negative i1 and i2 values', () => {
    const i1 = refBase64([0xff, 0x80, 0x7f]);
    sameTyped(decodeTypedArray({ dtype: 'i1', bdata: i1 }), Int8Array.of(-1, -128, 127));
    const i2 = le([-2, 300], (dv, o, v) => dv.setInt16(o, v, true), 2);
    sameTyped(decodeTypedArray({ dtype: 'i2', bdata: i2 }), Int16Array.of(-2, 300));
  });

  it('reads u1c as Uint8ClampedArray', () => {
    const bdata = refBase64([0, 200, 255]);
    sameTyped(decodeTypedArray({ dtype: 'u1c', bdata }), Uint8ClampedArray.of(0, 200, 255));
  });

  it('accepts numpy byte-order prefixes and plotly long names', () => {
    const f4 = le([0.5, -3], (dv, o, v) => dv.setFloat32(o, v, true), 4);
    sameTyped(decodeTypedArray({ dtype: '<f4', bdata: f4 }), Float32Array.of(0.5, -3));
    sameTyped(decodeTypedArray({ dtype: '=f4', bdata: f4 }), Float32Array.of(0.5, -3));
    sameTyped(decodeTypedArray({ dtype: 'float32', bdata: f4 }), Float32Array.of(0.5, -3));
    const u1 = refBase64([7]);
    sameTyped(decodeTypedArray({ dtype: '|u1', bdata: u1 }), Uint8Array.of(7));
    sameTyped(decodeTypedArray({ dtype: 'uint8c', bdata: u1 }), Uint8ClampedArray.of(7));
  });

  it('reads big-endian (">") data', () => {
    const dv = new DataView(new ArrayBuffer(16));
    dv.setFloat64(0, 1.25, false);
    dv.setFloat64(8, -7, false);
    const be = refBase64(dv.buffer);
    sameTyped(decodeTypedArray({ dtype: '>f8', bdata: be }), Float64Array.of(1.25, -7));
  });

  it('reads 2D shapes as rows of views (string, number and array shapes)', () => {
    const bdata = le([1, 2, 3, 4, 5, 6], (dv, o, v) => dv.setFloat64(o, v, true), 8);
    const rows = decodeTypedArray({ dtype: 'f8', bdata, shape: '2,3' }) as Float64Array[];
    expect(rows).toHaveLength(2);
    sameTyped(rows[0], Float64Array.of(1, 2, 3));
    sameTyped(rows[1], Float64Array.of(4, 5, 6));
    expect(rows[0]?.buffer).toBe(rows[1]?.buffer);
    const arrShape = decodeTypedArray({ dtype: 'f8', bdata, shape: [3, 2] }) as Float64Array[];
    expect(arrShape.map((r) => Array.from(r))).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    sameTyped(
      decodeTypedArray({ dtype: 'f8', bdata, shape: 6 }),
      Float64Array.of(1, 2, 3, 4, 5, 6),
    );
    const sq = le([1, 2, 3, 4], (dv, o, v) => dv.setInt32(o, v, true), 4);
    const m = decodeTypedArray({ dtype: 'i4', bdata: sq, shape: ' 2, 2' }) as Int32Array[];
    expect(m.map((r) => Array.from(r))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('reads 3D shapes', () => {
    const bdata = refBase64([0, 1, 2, 3, 4, 5, 6, 7]);
    const cube = decodeTypedArray({ dtype: 'u1', bdata, shape: '2,2,2' }) as Uint8Array[][];
    expect(cube.map((m) => m.map((r) => Array.from(r)))).toEqual([
      [
        [0, 1],
        [2, 3],
      ],
      [
        [4, 5],
        [6, 7],
      ],
    ]);
  });

  it('reads an ArrayBuffer bdata without aliasing it', () => {
    const buf = Float32Array.of(1, 2).buffer;
    const out = decodeTypedArray({ dtype: 'f4', bdata: buf }) as Float32Array;
    sameTyped(out, Float32Array.of(1, 2));
    expect(out.buffer).not.toBe(buf);
  });

  it('rejects malformed specs', () => {
    expect(() => decodeTypedArray({ dtype: 'i8', bdata: '' })).toThrow(/unknown typed array dtype/);
    expect(() => decodeTypedArray({ dtype: 'f8', bdata: 'AAAA' })).toThrow(/not a multiple of 8/);
    expect(() => decodeTypedArray({ dtype: 'u1', bdata: 'AAAA', shape: '2,2' })).toThrow(
      /does not match 3 elements/,
    );
    expect(() => decodeTypedArray({ dtype: 'u1', bdata: 'AAAA', shape: '3,' })).toThrow(
      /invalid typed array shape/,
    );
    expect(() => decodeTypedArray({ dtype: 'u1', bdata: 'AAAA', shape: [-3] })).toThrow(
      /invalid typed array shape/,
    );
    expect(() => decodeTypedArray({ dtype: 'u1', bdata: 'AAAA', shape: '1,1,1,3' })).toThrow(
      /more than 3 dimensions/,
    );
  });
});

describe('isTypedArraySpec', () => {
  it('accepts specs with known dtypes', () => {
    expect(isTypedArraySpec({ dtype: 'f8', bdata: '' })).toBe(true);
    expect(isTypedArraySpec({ dtype: '<i4', bdata: '', shape: '1,0' })).toBe(true);
    expect(isTypedArraySpec({ dtype: 'u1', bdata: new ArrayBuffer(0), shape: 0 })).toBe(true);
    expect(isTypedArraySpec({ dtype: 'u1', bdata: '', shape: [1, 0] })).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isTypedArraySpec(null)).toBe(false);
    expect(isTypedArraySpec([])).toBe(false);
    expect(isTypedArraySpec({ dtype: 'i8', bdata: '' })).toBe(false);
    expect(isTypedArraySpec({ dtype: 'toString', bdata: '' })).toBe(false);
    expect(isTypedArraySpec({ dtype: 8, bdata: '' })).toBe(false);
    expect(isTypedArraySpec({ dtype: 'f8', bdata: [1] })).toBe(false);
    expect(isTypedArraySpec({ dtype: 'f8', bdata: '', shape: { rows: 1 } })).toBe(false);
    expect(isTypedArraySpec({ dtype: 'f8', bdata: '', shape: ['1'] })).toBe(false);
  });
});

describe('encodeTypedMatrix', () => {
  it('packs equal-length rows of one type row-major', () => {
    const rows = [Float64Array.of(1, 2, 3), new Float64Array([9, 4, 5, 6]).subarray(1)];
    const spec = encodeTypedMatrix(rows);
    expect(spec).toEqual({
      dtype: 'f8',
      bdata: encodeTypedArray(Float64Array.of(1, 2, 3, 4, 5, 6)).bdata,
      shape: '2,3',
    });
    const back = decodeTypedArray(spec!) as Float64Array[];
    back.forEach((r, i) => sameTyped(r, rows[i] as Float64Array));
  });

  it('handles zero-width rows', () => {
    const spec = encodeTypedMatrix([new Int8Array(0), new Int8Array(0)]);
    expect(spec).toEqual({ dtype: 'i1', bdata: '', shape: '2,0' });
    expect(decodeTypedArray(spec!)).toEqual([new Int8Array(0), new Int8Array(0)]);
  });

  it('declines empty, ragged, mixed and non-typed rows', () => {
    expect(encodeTypedMatrix([])).toBeUndefined();
    expect(encodeTypedMatrix([[1, 2]])).toBeUndefined();
    expect(encodeTypedMatrix([Float64Array.of(1), Float64Array.of(1, 2)])).toBeUndefined();
    expect(encodeTypedMatrix([Float64Array.of(1), Float32Array.of(1)])).toBeUndefined();
    expect(encodeTypedMatrix([Float64Array.of(1), [1]])).toBeUndefined();
    expect(encodeTypedMatrix([new DataView(new ArrayBuffer(1))])).toBeUndefined();
    expect(encodeTypedMatrix([BigInt64Array.of(1n)])).toBeUndefined();
  });
});
