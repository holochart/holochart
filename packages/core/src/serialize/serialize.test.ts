import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import { figureArbitrary } from '../__testing__/schema-arbitrary.ts';
import type { FigureInput } from '../defaults/types.ts';
import type { TypedArray } from '../schema/types.ts';
import {
  decodeFigure,
  encodeFigure,
  type EncodeFigureOptions,
  type SerializeWarning,
} from './serialize.ts';

const registry = fixtureRegistry();

afterEach(() => {
  vi.restoreAllMocks();
});

/** Encode with the fixture registry, collecting warnings. */
function encode(
  figure: FigureInput,
  opts: EncodeFigureOptions = { registry },
): { json: ReturnType<typeof encodeFigure>; warnings: SerializeWarning[] } {
  const warnings: SerializeWarning[] = [];
  const json = encodeFigure(figure, { ...opts, onWarning: (w) => warnings.push(w) });
  return { json, warnings };
}

/** encode → JSON text → decode. */
function roundTrip(figure: FigureInput, opts?: EncodeFigureOptions): FigureInput {
  return decodeFigure(JSON.stringify(encode(figure, opts).json));
}

const GONE = Symbol('gone');

/**
 * Canonical form for comparing a figure with its decoded round trip: what encodeFigure promises
 * to preserve. Typed arrays compare by type and bits (NaN and -0 spelled out); Dates become ISO
 * strings; plain numbers follow JSON (non-finite → null, -0 → 0); functions and undefined vanish
 * (null in arrays).
 */
function canon(v: unknown): unknown {
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const arr = v as TypedArray;
    return {
      typed: arr.constructor.name,
      values: Array.from(arr, (n) => (Object.is(n, -0) ? '-0' : Number.isNaN(n) ? 'NaN' : n)),
    };
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return Number.isFinite(v) ? v + 0 : null;
  if (typeof v === 'function' || v === undefined) return GONE;
  if (Array.isArray(v)) {
    return v.map((x: unknown) => {
      const c = canon(x);
      return c === GONE ? null : c;
    });
  }
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const c = canon(x);
      if (c !== GONE) out[k] = c;
    }
    return out;
  }
  return v;
}

/** Recursively freeze plain containers (typed arrays cannot be frozen; checked separately). */
function deepFreeze<T>(v: T): T {
  if (Array.isArray(v) || (typeof v === 'object' && v !== null && !ArrayBuffer.isView(v))) {
    if (v instanceof Date) return v;
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

const SPECIAL = [NaN, -0, 0, Infinity, -Infinity, 1.5];

describe('encodeFigure / decodeFigure round trip', () => {
  const heat = [Float64Array.of(1, NaN, 3), Float64Array.of(-0, Infinity, 6)];
  const figure: FigureInput = {
    data: [
      {
        type: 'scatter',
        x: Float64Array.from(SPECIAL),
        y: Float32Array.from(SPECIAL),
        customdata: [Int32Array.of(-1, 2), Uint32Array.of(4294967295)],
        text: ['a', 'b'],
        marker: { size: Int16Array.of(-3, 4), color: Uint8Array.of(1, 2), opacity: [0.5, 1] },
      },
      {
        type: 'bar',
        x: [new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 6)), '2024-02-29'],
        y: Uint16Array.of(1, 65535),
        marker: { color: Int8Array.of(-128, 127) },
      },
      { type: 'heatmap', z: heat, ragged: [Float64Array.of(1), Float64Array.of(1, 2)] },
      { type: 'scatter', dataset: 'sales', x: '@date', y: '@revenue' },
      { type: 'scatter', x: new Float64Array(0), y: new Uint8ClampedArray(0) },
    ],
    layout: {
      title: { text: 'Round trip' },
      annotations: [
        { text: 'a', x: new Date(Date.UTC(2024, 5, 1)), y: 3 },
        { text: 'b', x: 'c', y: -0, font: { size: 12 } },
      ],
      xaxis: { range: [0, 10] },
      images: Uint8ClampedArray.of(0, 128, 255),
    },
    config: { responsive: true, scrollZoom: false },
    datasets: {
      sales: {
        date: ['2024-01-01', '2024-01-02'],
        revenue: Float64Array.of(1.25, NaN),
        units: Int32Array.of(3, 4),
        when: [new Date(Date.UTC(2020, 1, 1))],
      },
    },
    frames: [
      { name: 'f0', data: [{ y: Float64Array.of(9, 8) }], layout: { title: { text: 'f0' } } },
      { name: 'f1', traces: [1], data: [{ y: Uint16Array.of(7, 6) }] },
    ],
  };

  it('preserves every value (typed arrays bit-exactly)', () => {
    const back = roundTrip(figure);
    expect(canon(back)).toEqual(canon(figure));
    const t0 = (back.data?.[0] ?? {}) as Record<string, unknown>;
    expect(t0['x']).toBeInstanceOf(Float64Array);
    expect(Object.is((t0['x'] as Float64Array)[1], -0)).toBe(true);
    expect(Number.isNaN((t0['y'] as Float32Array)[0])).toBe(true);
    expect((t0['customdata'] as unknown[])[0]).toBeInstanceOf(Int32Array);
  });

  it('writes JSON-stable output', () => {
    const { json, warnings } = encode(figure);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    expect(warnings).toEqual([]);
  });

  it('encodes a Float64Array[] as one 2D spec and ragged rows one by one', () => {
    const { json } = encode(figure);
    const heatmap = (json.data as Record<string, unknown>[])[2] as Record<string, unknown>;
    expect(heatmap['z']).toMatchObject({ dtype: 'f8', shape: '2,3' });
    expect(heatmap['ragged']).toEqual([
      { dtype: 'f8', bdata: expect.any(String) as unknown },
      { dtype: 'f8', bdata: expect.any(String) as unknown },
    ]);
    const z = (decodeFigure(json).data?.[2] as Record<string, unknown>)['z'] as Float64Array[];
    expect(z).toHaveLength(2);
    expect(canon(z)).toEqual(canon(heat));
  });

  it('encodes only the bytes of subarray views', () => {
    const base = Float64Array.of(100, 1, 2, 3, 200);
    const { json } = encode({ data: [{ type: 'scatter', x: base.subarray(1, 4) }] });
    const x = (json.data as Record<string, unknown>[])[0]?.['x'];
    expect(x).toEqual({ dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQAAAAAAAAAhA' });
  });

  it('writes Dates as ISO strings and keeps date strings', () => {
    const { json } = encode(figure);
    const bar = (json.data as Record<string, unknown>[])[1] as Record<string, unknown>;
    expect(bar['x']).toEqual(['2024-01-02T03:04:05.006Z', '2024-02-29']);
    const back = decodeFigure(json).data?.[1] as Record<string, unknown>;
    expect(back['x']).toEqual(['2024-01-02T03:04:05.006Z', '2024-02-29']);
  });

  it('follows JSON for non-finite and negative-zero plain numbers', () => {
    const { json } = encode({ layout: { v: [NaN, Infinity, -Infinity, -0, 2], n: -0, m: NaN } });
    expect(json.layout).toEqual({ v: [null, null, null, 0, 2], n: 0, m: null });
    expect(Object.is((json.layout as { n: number }).n, 0)).toBe(true);
  });

  it('never mutates the input', () => {
    const input = deepFreeze(structuredClone(figure));
    const snapshot = structuredClone(input);
    const back = roundTrip(input);
    expect(canon(input)).toEqual(canon(snapshot));
    // The decoded figure shares nothing with the input.
    expect((back.data?.[0] as Record<string, unknown>)['x']).not.toBe(
      (input.data?.[0] as Record<string, unknown>)['x'],
    );
  });

  it('works without a registry and keeps unknown top-level keys', () => {
    const back = roundTrip(
      { data: [{ x: Int8Array.of(1) }], extra: { a: [1] } } as FigureInput,
      {},
    );
    expect(canon(back)).toEqual(canon({ data: [{ x: Int8Array.of(1) }], extra: { a: [1] } }));
  });

  it('keeps `__proto__` keys as own data', () => {
    const layout = JSON.parse('{"__proto__": {"polluted": 1}, "a": 2}') as unknown;
    const { json } = encode({ layout });
    expect(Object.getPrototypeOf(json.layout)).toBe(Object.prototype);
    expect(Object.hasOwn(json.layout as object, '__proto__')).toBe(true);
    const back = decodeFigure(JSON.stringify(json));
    expect(Object.hasOwn(back.layout as object, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('style functions (ADR-012, E8.6)', () => {
  it('evaluates arrayOk accessors into per-point arrays', () => {
    const color = vi.fn((p: { x: number; y: number }, i: number) =>
      p.y > 10 ? 'gold' : `gray${i}`,
    );
    const trace = {
      type: 'scatter',
      x: [1, 2, 3],
      y: Float64Array.of(5, 20, 7, 99),
      customdata: ['a', 'b', 'c'],
      marker: { color, size: (p: { x: number }) => p.x * 2 },
    };
    const { json, warnings } = encode({ data: [trace] });
    const marker = (json.data as Record<string, Record<string, unknown>>[])[0]?.['marker'];
    // The point count is the shorter of x and y.
    expect(marker).toEqual({ color: ['gray0', 'gold', 'gray2'], size: [2, 4, 6] });
    expect(color).toHaveBeenCalledTimes(3);
    expect(color.mock.calls[1]).toEqual([{ x: 2, y: 20, customdata: 'b' }, 1, trace]);
    // Once per path, however many points.
    expect(warnings.map((w) => [w.path, w.code])).toEqual([
      ['data[0].marker.color', 'function-evaluated'],
      ['data[0].marker.size', 'function-evaluated'],
    ]);
  });

  it('resolves dataset column references for points', () => {
    const { json } = encode({
      datasets: { ds: { d: ['2024-01-01', '2024-01-02'], v: Float64Array.of(1, 30) } },
      data: [
        {
          type: 'scatter',
          dataset: 'ds',
          x: '@d',
          y: '@v',
          marker: { color: (p: { y: number }) => (p.y > 10 ? 'red' : 'blue') },
        },
      ],
    });
    const t = (json.data as Record<string, unknown>[])[0];
    expect(t).toMatchObject({ x: '@d', y: '@v', marker: { color: ['blue', 'red'] } });
  });

  it('uses the first data array when the trace has no x or y', () => {
    const { json } = encode({
      data: [
        {
          type: 'scatter',
          customdata: [1, 2],
          text: (p: { customdata: number }) => `#${p.customdata}`,
        },
      ],
    });
    expect((json.data as Record<string, unknown>[])[0]?.['text']).toEqual(['#1', '#2']);
  });

  it('defaults a missing type to scatter', () => {
    const { json } = encode({ data: [{ x: [1], y: [2], marker: { size: () => 3 } }] });
    expect((json.data as Record<string, unknown>[])[0]?.['marker']).toEqual({ size: [3] });
  });

  it('encodes evaluated values like any other (Dates, NaN)', () => {
    const { json } = encode({
      data: [
        {
          type: 'scatter',
          x: [1, 2],
          text: (_p: unknown, i: number) => (i === 0 ? new Date(0) : NaN),
        },
      ],
    });
    expect((json.data as Record<string, unknown>[])[0]?.['text']).toEqual([
      '1970-01-01T00:00:00.000Z',
      null,
    ]);
  });

  it('drops functions on non-arrayOk attributes and config callbacks', () => {
    const { json, warnings } = encode({
      data: [
        { type: 'scatter', x: [1], line: { color: () => 'red', width: 2 }, text: [() => 'a'] },
      ],
      layout: { title: { text: () => 'x' } },
      config: { renderHover: () => null, responsive: true },
    });
    expect((json.data as Record<string, unknown>[])[0]).toEqual({
      type: 'scatter',
      x: [1],
      line: { width: 2 },
      text: [null],
    });
    expect(json.layout).toEqual({ title: {} });
    expect(json.config).toEqual({ responsive: true });
    expect(warnings.map((w) => [w.path, w.code])).toEqual([
      ['data[0].line.color', 'function-dropped'],
      ['data[0].text[0]', 'function-dropped'],
      ['layout.title.text', 'function-dropped'],
      ['config.renderHover', 'function-dropped'],
    ]);
    expect(warnings[3]?.message).toMatch(/not a per-point/);
  });

  it('drops functions without a registry, unknown types or data arrays', () => {
    const fn = (): string => 'red';
    const noRegistry = encode({ data: [{ type: 'scatter', x: [1], marker: { color: fn } }] }, {});
    expect(noRegistry.warnings[0]?.message).toMatch(/pass `registry`/);
    expect((noRegistry.json.data as Record<string, unknown>[])[0]).toEqual({
      type: 'scatter',
      x: [1],
      marker: {},
    });
    const { json, warnings } = encode({
      data: [
        { type: 'nope', x: [1], marker: { color: fn } },
        { type: 'scatter', marker: { color: fn } },
        { type: 'scatter', x: 'not an array', marker: { color: fn } },
      ],
    });
    expect((json.data as Record<string, unknown>[]).map((t) => t['marker'])).toEqual([{}, {}, {}]);
    expect(warnings.map((w) => w.code)).toEqual([
      'function-dropped',
      'function-dropped',
      'function-dropped',
    ]);
    expect(warnings[1]?.message).toMatch(/no data arrays/);
  });

  it('drops accessors that throw', () => {
    const { json, warnings } = encode({
      data: [
        {
          type: 'scatter',
          x: [1, 2],
          marker: {
            color: (_p: unknown, i: number) => {
              if (i === 1) throw new Error('boom');
              return 'red';
            },
            size: () => {
              // Non-Error throwables are reported too.
              throw 'bad';
            },
          },
        },
      ],
    });
    expect((json.data as Record<string, unknown>[])[0]?.['marker']).toEqual({});
    expect(warnings).toEqual([
      {
        path: 'data[0].marker.color',
        code: 'function-failed',
        message: expect.stringMatching(/boom/) as unknown,
      },
      {
        path: 'data[0].marker.size',
        code: 'function-failed',
        message: expect.stringMatching(/bad/) as unknown,
      },
    ]);
  });

  it('evaluates frame accessors over the frame trace or the trace it updates', () => {
    const size = (p: { y: number }): number => p.y;
    const { json } = encode({
      data: [
        { type: 'scatter', x: [1, 2], y: [10, 20] },
        { type: 'bar', x: [1], y: [5] },
      ],
      frames: [
        { data: [{ marker: { size } }] },
        { data: [{ y: [7, 8, 9], x: [0, 0, 0], marker: { size } }] },
        { traces: [1], data: [{ marker: { color: (p: { y: number }) => `c${p.y}` } }] },
        { traces: [9], data: [{ marker: { size } }] },
        { data: 'junk' },
        'not a frame',
      ],
    });
    expect(json.frames).toEqual([
      { data: [{ marker: { size: [10, 20] } }] },
      { data: [{ y: [7, 8, 9], x: [0, 0, 0], marker: { size: [7, 8, 9] } }] },
      { traces: [1], data: [{ marker: { color: ['c5'] } }] },
      { traces: [9], data: [{ marker: {} }] },
      { data: 'junk' },
      'not a frame',
    ]);
  });

  it('reports through console.warn by default', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    encodeFigure({ config: { renderHover: () => null } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatch(/config\.renderHover: function dropped/);
  });
});

describe('other non-JSON values', () => {
  class Point {
    x = 1;
  }

  it('drops Maps, Sets, class instances, symbols and buffers (null in arrays)', () => {
    const { json, warnings } = encode({
      layout: {
        map: new Map([[1, 2]]),
        set: new Set([1]),
        point: new Point(),
        sym: Symbol('s'),
        view: new DataView(new ArrayBuffer(2)),
        buf: new ArrayBuffer(2),
        list: [new Map(), Symbol('t'), undefined, 1],
        undef: undefined,
      },
    });
    expect(json.layout).toEqual({ list: [null, null, null, 1] });
    expect(warnings.map((w) => [w.path, w.code])).toEqual([
      ['layout.map', 'unsupported-value'],
      ['layout.set', 'unsupported-value'],
      ['layout.point', 'unsupported-value'],
      ['layout.sym', 'unsupported-value'],
      ['layout.view', 'unsupported-value'],
      ['layout.buf', 'unsupported-value'],
      ['layout.list[0]', 'unsupported-value'],
      ['layout.list[1]', 'unsupported-value'],
    ]);
    expect(warnings[2]?.message).toMatch(/a Point/);
    expect(warnings[3]?.message).toMatch(/symbol/);
    const bare = encode({ layout: { o: Object.create(Object.create(null) as object) as object } });
    expect(bare.warnings[0]?.message).toMatch(/an object/);
  });

  it('writes invalid Dates as null with a warning', () => {
    const { json, warnings } = encode({ layout: { d: new Date(NaN), list: [new Date('x')] } });
    expect(json.layout).toEqual({ d: null, list: [null] });
    expect(warnings.map((w) => w.code)).toEqual(['invalid-date', 'invalid-date']);
  });

  it('writes BigInts as numbers, warning only when rounding', () => {
    const { json, warnings } = encode({
      layout: {
        small: 5n,
        big: 2n ** 64n + 1n,
        arr: BigInt64Array.of(-1n, 2n),
        u: BigUint64Array.of(3n),
      },
    });
    expect(json.layout).toEqual({ small: 5, big: 2 ** 64, arr: [-1, 2], u: [3] });
    expect(warnings.map((w) => [w.path, w.code])).toEqual([
      ['layout.big', 'bigint'],
      ['layout.arr', 'bigint'],
      ['layout.u', 'bigint'],
    ]);
  });

  it('honors toJSON once', () => {
    const when = { toJSON: () => '2024-01-01' };
    const selfish = {
      toJSON(): unknown {
        return this;
      },
    };
    Object.setPrototypeOf(when, { kind: 'Temporal' });
    Object.setPrototypeOf(selfish, { kind: 'Loop' });
    const { json, warnings } = encode({ layout: { when, selfish } });
    expect(json.layout).toEqual({ when: '2024-01-01' });
    expect(warnings.map((w) => [w.path, w.code])).toEqual([['layout.selfish', 'cycle']]);
  });

  it('drops circular references but encodes shared ones', () => {
    const shared = [1, 2];
    const loop: Record<string, unknown> = { a: 1, shared };
    loop['self'] = loop;
    const arr: unknown[] = [shared];
    arr.push(arr);
    const fig: Record<string, unknown> = { layout: loop, config: { arr, again: shared } };
    fig['self'] = fig;
    const data: unknown[] = [];
    data.push(data);
    fig['data'] = data;
    const frames: unknown[] = [fig];
    frames.push(frames);
    fig['frames'] = frames;
    const { json, warnings } = encode(fig as FigureInput);
    expect(json).toEqual({
      layout: { a: 1, shared: [1, 2] },
      config: { arr: [[1, 2], null], again: [1, 2] },
      data: [null],
      frames: [null, null],
    });
    expect(warnings.every((w) => w.code === 'cycle')).toBe(true);
    expect(warnings.map((w) => w.path)).toEqual([
      'layout.self',
      'config.arr[1]',
      'self',
      'data[0]',
      'frames[0]',
      'frames[1]',
    ]);
  });

  it('rejects a non-object figure', () => {
    expect(() => encodeFigure(null as unknown as FigureInput)).toThrow(TypeError);
    expect(() => encodeFigure([] as unknown as FigureInput)).toThrow(TypeError);
  });
});

describe('decodeFigure', () => {
  it('decodes Plotly-encoded specs anywhere in the figure', () => {
    const fig = decodeFigure({
      data: [
        {
          type: 'heatmap',
          x: { dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQA==' },
          z: { dtype: '<i1', bdata: '/wABAg==', shape: '2,2' },
          marker: { color: { dtype: 'u1c', bdata: 'AP8=' } },
        },
      ],
      layout: { meta: [{ dtype: 'u2', bdata: 'AQA=' }] },
    });
    const t = fig.data?.[0] as Record<string, unknown>;
    expect(t['x']).toEqual(Float64Array.of(1, 2));
    expect((t['z'] as Int8Array[]).map((r) => Array.from(r))).toEqual([
      [-1, 0],
      [1, 2],
    ]);
    expect((t['marker'] as Record<string, unknown>)['color']).toEqual(Uint8ClampedArray.of(0, 255));
    expect((fig.layout as { meta: unknown[] }).meta[0]).toEqual(Uint16Array.of(1));
  });

  it('leaves non-specs alone and does not mutate the input', () => {
    const input = deepFreeze({
      data: [
        { x: { dtype: 'i8', bdata: 'AAAAAAAAAAA=' }, y: [1, '2024-01-01'], z: { dtype: 'f8' } },
      ],
      layout: { title: { text: 'hi' } },
    });
    const out = decodeFigure(input);
    expect(out).toEqual(input);
    expect(out.layout).not.toBe(input.layout);
  });

  it('passes through live values', () => {
    const x = Float64Array.of(1);
    const out = decodeFigure({ data: [{ x }] });
    expect((out.data?.[0] as Record<string, unknown>)['x']).toBe(x);
  });

  it('reports malformed specs with their path', () => {
    expect(() => decodeFigure({ data: [{ x: { dtype: 'f8', bdata: 'AAAA' } }] })).toThrow(
      /decodeFigure: data\[0\]\.x: .*not a multiple of 8/,
    );
  });

  it('rejects non-objects', () => {
    expect(() => decodeFigure('[1]')).toThrow(TypeError);
    expect(() => decodeFigure(3)).toThrow(TypeError);
    expect(() => decodeFigure('{')).toThrow(SyntaxError);
  });
});

describe('round-trip property (schema-derived figures)', () => {
  const typed = fc.oneof(
    fc.float64Array({ maxLength: 6 }),
    fc.float32Array({ maxLength: 6 }),
    fc.int32Array({ maxLength: 6 }),
    fc.uint32Array({ maxLength: 6 }),
    fc.int16Array({ maxLength: 6 }),
    fc.uint16Array({ maxLength: 6 }),
    fc.int8Array({ maxLength: 6 }),
    fc.uint8Array({ maxLength: 6 }),
    fc.uint8ClampedArray({ maxLength: 6 }),
  );
  const matrix = fc
    .tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 0, max: 3 }))
    .chain(([rows, cols]) =>
      fc.array(fc.float64Array({ minLength: cols, maxLength: cols }), {
        minLength: rows,
        maxLength: rows,
      }),
    );
  const extraColumns = fc.dictionary(
    fc.string({ maxLength: 4 }),
    fc.oneof(typed, matrix, fc.array(fc.date({ noInvalidDate: true }), { maxLength: 3 })),
    { maxKeys: 3 },
  );

  it('decode(JSON(encode(figure))) ≡ figure', () => {
    fc.assert(
      fc.property(figureArbitrary(registry), extraColumns, (generated, extra) => {
        const figure = {
          ...generated,
          datasets: { ...(generated.datasets as object), extra },
        } as FigureInput;
        const { json, warnings } = encode(figure);
        expect(JSON.parse(JSON.stringify(json))).toEqual(json);
        // Only function-valued config attributes (dropped) may warn on valid figures.
        for (const w of warnings) expect(w.code).toBe('function-dropped');
        expect(canon(decodeFigure(JSON.stringify(json)))).toEqual(canon(figure));
      }),
      { numRuns: 150 },
    );
  });
});
