import { describe, expect, it } from 'vitest';
import type { FullLayout } from '../defaults/types.ts';
import {
  axisTypeChangeEdits,
  convertAxisCoord,
  convertAxisSize,
  toLogRange,
} from './convert-coords.ts';

/** A minimal full layout: axes by name plus optional defaulted annotations/images. */
function full(extra: Record<string, unknown>): FullLayout {
  return { _subplots: { cartesian: ['xy'], xaxis: ['x'], yaxis: ['y'] }, ...extra } as FullLayout;
}

const linearFixed = { type: 'linear', range: [1, 1000], autorange: false };
const logFixed = { type: 'log', range: [0, 3], autorange: false };

describe('toLogRange', () => {
  it('takes log10 of positive values', () => {
    expect(toLogRange(100, [1, 10])).toBeCloseTo(2);
    expect(toLogRange(0.01, [1, 10])).toBeCloseTo(-2);
  });

  it('puts non-positive values at the smaller range end', () => {
    expect(toLogRange(0, [10, 1000])).toBeCloseTo(1);
    expect(toLogRange(-5, [1000, 10])).toBeCloseTo(1);
  });

  it('goes six decades below the larger end when the smaller is not positive', () => {
    expect(toLogRange(-5, [-10, 1000])).toBeCloseTo(-3);
    expect(toLogRange(0, [0, 100])).toBeCloseTo(-4);
  });
});

describe('convertAxisCoord', () => {
  it('converts both ways and round-trips', () => {
    const r: [number, number] = [1, 1000];
    const log = convertAxisCoord(250, 'linear', 'log', r)!;
    expect(log).toBeCloseTo(Math.log10(250));
    expect(convertAxisCoord(log, 'log', 'linear', [0, 3])).toBeCloseTo(250);
  });

  it('accepts numeric strings and nulls the rest', () => {
    expect(convertAxisCoord('100', 'linear', 'log', [1, 10])).toBeCloseTo(2);
    expect(convertAxisCoord('abc', 'linear', 'log', [1, 10])).toBeNull();
    expect(convertAxisCoord(Infinity, 'log', 'linear', [0, 1])).toBeNull();
    expect(convertAxisCoord(5000, 'log', 'linear', [0, 1])).toBeNull();
  });

  it('leaves the value alone for other type pairs', () => {
    expect(convertAxisCoord(7, 'log', 'log', [0, 1])).toBe(7);
  });
});

describe('convertAxisSize', () => {
  it('uses sinh / arcsinh so linear → log → linear round-trips', () => {
    const r: [number, number] = [1, 1000];
    const log = convertAxisSize(100, 50, 'linear', 'log', r);
    expect(log.pos).toBeCloseTo(2);
    const dx = 50 / 100 / 2;
    expect(log.size).toBeCloseTo(2 * Math.log10(dx + Math.sqrt(1 + dx * dx)));
    const back = convertAxisSize(log.pos, log.size, 'log', 'linear', [0, 3]);
    expect(back.pos).toBeCloseTo(100);
    expect(back.size).toBeCloseTo(50);
  });

  it('log → linear: pos 10^p, size pos·(10^(s/2) − 10^(−s/2))', () => {
    const out = convertAxisSize(1, 2, 'log', 'linear', [0, 3]);
    expect(out.pos).toBeCloseTo(10);
    expect(out.size).toBeCloseTo(10 * (10 - 0.1));
  });

  it('nulls both when the position fails, only the size when the size fails', () => {
    expect(convertAxisSize('no', 1, 'linear', 'log', [1, 10])).toEqual({ pos: null, size: null });
    expect(convertAxisSize(1, 'no', 'log', 'linear', [0, 1])).toEqual({ pos: 10, size: null });
  });
});

describe('axisTypeChangeEdits', () => {
  it('returns the update itself without a type edit', () => {
    const u = { 'yaxis.range': [0, 1] };
    expect(axisTypeChangeEdits(u, {}, full({ yaxis: linearFixed }))).toBe(u);
  });

  it('converts a fixed range linear → log and back', () => {
    const layoutIn = { yaxis: { range: [1, 1000] } };
    const toLog = axisTypeChangeEdits(
      { 'yaxis.type': 'log' },
      layoutIn,
      full({ yaxis: linearFixed }),
    );
    expect(toLog).toEqual({ 'yaxis.type': 'log', 'yaxis.range': [0, 3] });
    const fromLog = axisTypeChangeEdits(
      { 'yaxis.type': 'linear' },
      { yaxis: { type: 'log', range: [0, 3] } },
      full({ yaxis: logFixed }),
    );
    expect(fromLog['yaxis.range']).toEqual([1, 1000]);
  });

  it('puts a non-positive end six decades below the other', () => {
    const lf = { type: 'linear', range: [0, 100], autorange: false };
    const a = axisTypeChangeEdits({ 'yaxis.type': 'log' }, {}, full({ yaxis: lf }));
    expect(a['yaxis.range']).toEqual([-4, 2]);
    const rev = { type: 'linear', range: [100, -1], autorange: false };
    const b = axisTypeChangeEdits({ 'yaxis.type': 'log' }, {}, full({ yaxis: rev }));
    expect(b['yaxis.range']).toEqual([2, -4]);
  });

  it('autoranges when both range ends are non-positive', () => {
    const neg = { type: 'linear', range: [-10, 0], autorange: false };
    const out = axisTypeChangeEdits({ 'yaxis.type': 'log' }, {}, full({ yaxis: neg }));
    expect(out).toEqual({ 'yaxis.type': 'log', 'yaxis.autorange': true });
  });

  it('keeps the range of autoranged axes', () => {
    for (const autorange of [true, 'reversed', 'min']) {
      const ax = { type: 'linear', range: [1, 1000], autorange };
      const out = axisTypeChangeEdits({ 'yaxis.type': 'log' }, {}, full({ yaxis: ax }));
      expect(out).toEqual({ 'yaxis.type': 'log' });
    }
  });

  it('autoranges on other type changes, and ignores same-type and auto edits', () => {
    const out = axisTypeChangeEdits({ 'xaxis.type': 'date' }, {}, full({ xaxis: linearFixed }));
    expect(out).toEqual({ 'xaxis.type': 'date', 'xaxis.autorange': true, 'xaxis.range': null });
    const cat = axisTypeChangeEdits({ 'yaxis.type': 'category' }, {}, full({ yaxis: logFixed }));
    expect(cat).toMatchObject({ 'yaxis.autorange': true, 'yaxis.range': null });
    for (const t of ['linear', '-', null, 'bogus']) {
      const u = { 'xaxis.type': t };
      expect(axisTypeChangeEdits(u, {}, full({ xaxis: linearFixed }))).toEqual(u);
    }
    // No full axis (not drawn yet): nothing to convert from.
    expect(axisTypeChangeEdits({ 'xaxis3.type': 'log' }, {}, undefined)).toEqual({
      'xaxis3.type': 'log',
    });
  });

  it('converts data-referenced annotation x/ax and round-trips', () => {
    const annotations = [
      {
        _index: 0,
        x: 100,
        y: 5,
        xref: 'x',
        yref: 'y',
        ax: 10,
        axref: 'x',
        ay: -30,
        ayref: 'pixel',
      },
      { _index: 1, x: 0.5, xref: 'x domain', ax: 10, axref: 'pixel' },
      { _index: 2, x: 0.2, xref: 'paper' },
      { _index: -1, x: 100, xref: 'x' },
    ];
    const out = axisTypeChangeEdits(
      { 'xaxis.type': 'log' },
      {},
      full({ xaxis: { type: 'linear', range: [1, 1000], autorange: true }, annotations }),
    );
    expect(out).toEqual({
      'xaxis.type': 'log',
      'annotations[0].x': 2,
      'annotations[0].ax': 1,
    });
    const back = axisTypeChangeEdits(
      { 'xaxis.type': 'linear' },
      {},
      full({
        xaxis: { type: 'log', range: [0, 3], autorange: true },
        annotations: [{ _index: 0, x: 2, xref: 'x', ax: 1, axref: 'x' }],
      }),
    );
    expect(back['annotations[0].x']).toBeCloseTo(100);
    expect(back['annotations[0].ax']).toBeCloseTo(10);
  });

  it('converts annotations and images on other axis ids (y2)', () => {
    const fl = full({
      yaxis: logFixed,
      yaxis2: { type: 'linear', range: [10, 1000], autorange: false },
      annotations: [
        { _index: 0, y: 100, yref: 'y2', ay: 0, ayref: 'y2' },
        { _index: 1, y: 100, yref: 'y' },
      ],
      images: [
        { _index: 0, y: 100, sizey: 50, yref: 'y2', x: 1, sizex: 1, xref: 'x' },
        { _index: 1, y: 100, sizey: 1, yref: 'y' },
      ],
    });
    const out = axisTypeChangeEdits({ 'yaxis2.type': 'log' }, {}, fl);
    expect(out['yaxis2.range']).toEqual([1, 3]);
    expect(out['annotations[0].y']).toBeCloseTo(2);
    // ay = 0 is not positive: it goes to the lower range end (log10(10)).
    expect(out['annotations[0].ay']).toBeCloseTo(1);
    expect(out['images[0].y']).toBeCloseTo(2);
    const dx = 50 / 100 / 2;
    expect(out['images[0].sizey']).toBeCloseTo(2 * Math.log10(dx + Math.sqrt(1 + dx * dx)));
    expect(Object.keys(out).sort()).toEqual([
      'annotations[0].ay',
      'annotations[0].y',
      'images[0].sizey',
      'images[0].y',
      'yaxis2.range',
      'yaxis2.type',
    ]);
  });

  it('round-trips an image through log and back', () => {
    const toLog = axisTypeChangeEdits(
      { 'xaxis.type': 'log' },
      {},
      full({
        xaxis: { type: 'linear', range: [1, 1000], autorange: true },
        images: [{ _index: 0, x: 300, sizex: 200, xref: 'x' }],
      }),
    );
    const back = axisTypeChangeEdits(
      { 'xaxis.type': 'linear' },
      {},
      full({
        xaxis: { type: 'log', range: [0, 3], autorange: true },
        images: [
          {
            _index: 0,
            x: toLog['images[0].x'],
            sizex: toLog['images[0].sizex'],
            xref: 'x',
          },
        ],
      }),
    );
    expect(back['images[0].x']).toBeCloseTo(300);
    expect(back['images[0].sizex']).toBeCloseTo(200);
  });

  it('falls back to input items (default image size 1) without the components', () => {
    const layoutIn = {
      annotations: [{ x: 10, xref: 'x' }, { x: 10 }],
      images: [{ x: 10, xref: 'x' }],
    };
    const out = axisTypeChangeEdits(
      { 'xaxis.type': 'log' },
      layoutIn,
      full({ xaxis: { type: 'linear', range: [1, 100], autorange: true } }),
    );
    expect(out['annotations[0].x']).toBeCloseTo(1);
    expect('annotations[1].x' in out).toBe(false);
    expect(out['images[0].x']).toBeCloseTo(1);
    const dx = 1 / 10 / 2;
    expect(out['images[0].sizex']).toBeCloseTo(2 * Math.log10(dx + Math.sqrt(1 + dx * dx)));
  });

  it('never overrides values the update sets explicitly', () => {
    const fl = full({
      yaxis: linearFixed,
      annotations: [
        { _index: 0, y: 100, yref: 'y' },
        { _index: 1, y: 100, yref: 'y' },
      ],
      images: [{ _index: 0, y: 100, sizey: 10, yref: 'y' }],
    });
    const out = axisTypeChangeEdits(
      {
        'yaxis.type': 'log',
        'yaxis.range[0]': 0.5,
        'annotations[0].y': 1.5,
        'annotations[1]': { y: 7, yref: 'y' },
        'images[0].sizey': 0.3,
      },
      {},
      fl,
    );
    expect(out).toEqual({
      'yaxis.type': 'log',
      'yaxis.range[0]': 0.5,
      'annotations[0].y': 1.5,
      'annotations[1]': { y: 7, yref: 'y' },
      'images[0].sizey': 0.3,
      'images[0].y': 2,
    });
    const auto = axisTypeChangeEdits({ 'yaxis.type': 'log', 'yaxis.autorange': true }, {}, fl);
    expect('yaxis.range' in auto).toBe(false);
    expect(auto['annotations[0].y']).toBeCloseTo(2);
  });

  it('prefers the input range to the full one', () => {
    const out = axisTypeChangeEdits(
      { 'yaxis.type': 'log' },
      { yaxis: { range: ['10', '100'] } },
      full({ yaxis: linearFixed }),
    );
    expect(out['yaxis.range']).toEqual([1, 2]);
  });
});
