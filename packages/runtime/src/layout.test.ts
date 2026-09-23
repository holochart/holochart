import { describe, expect, it } from 'vitest';
import {
  axisName,
  domainSpan,
  MIN_PLOT_SIZE,
  plotArea,
  resolveFigureSize,
  resolveMargins,
  splitSubplotId,
  subplotRect,
} from './layout.ts';

const DEFAULTS = { width: 700, height: 450 };
const MARGIN = { l: 80, r: 80, t: 100, b: 80, autoexpand: true };

describe('resolveFigureSize', () => {
  it('uses the container for dimensions the layout leaves unset', () => {
    expect(resolveFigureSize({}, DEFAULTS, { width: 640, height: 400 })).toEqual({
      width: 640,
      height: 400,
    });
  });

  it('prefers explicit layout dimensions', () => {
    const size = resolveFigureSize(
      { width: 500 },
      { width: 500, height: 450 },
      { width: 640, height: 400 },
    );
    expect(size).toEqual({ width: 500, height: 400 });
  });

  it('falls back to layout defaults for a container without size', () => {
    expect(resolveFigureSize({}, DEFAULTS, { width: 0, height: 0 })).toEqual(DEFAULTS);
  });

  it('ignores invalid explicit values', () => {
    expect(
      resolveFigureSize({ width: -5, height: 'x' }, DEFAULTS, { width: 300, height: 0 }),
    ).toEqual({
      width: 300,
      height: 450,
    });
  });
});

describe('resolveMargins', () => {
  it('keeps margins when nothing pushes', () => {
    expect(resolveMargins(MARGIN, [], { width: 700, height: 450 })).toEqual({
      l: 80,
      r: 80,
      t: 100,
      b: 80,
    });
  });

  it('grows margins to the largest push per side with autoexpand', () => {
    const m = resolveMargins(MARGIN, [{ l: 120 }, { l: 90, b: 95 }, { r: 10 }], {
      width: 700,
      height: 450,
    });
    expect(m).toEqual({ l: 120, r: 80, t: 100, b: 95 });
  });

  it('ignores pushes without autoexpand', () => {
    const m = resolveMargins({ ...MARGIN, autoexpand: false }, [{ l: 300 }], {
      width: 700,
      height: 450,
    });
    expect(m.l).toBe(80);
  });

  it('shrinks margins proportionally to leave a minimum plot area', () => {
    const m = resolveMargins(MARGIN, [], { width: 200, height: 450 });
    expect(m.l + m.r).toBeCloseTo(200 - MIN_PLOT_SIZE);
    expect(m.l).toBeCloseTo(m.r);
  });
});

describe('plot area and domains', () => {
  const area = plotArea({ width: 700, height: 450 }, { l: 80, r: 80, t: 100, b: 80 });

  it('is the figure minus margins', () => {
    expect(area).toEqual({ x: 80, y: 100, width: 540, height: 270 });
  });

  it('maps x domains left to right and y domains bottom to top', () => {
    expect(domainSpan(area, 'x', [0.5, 1])).toEqual({ start: 350, end: 620 });
    // y: start is the bottom edge (larger container y).
    expect(domainSpan(area, 'y', [0, 0.5])).toEqual({ start: 370, end: 235 });
  });

  it('builds subplot rects from domains, sharing edges between neighbours', () => {
    const top = subplotRect(area, [0, 1], [0.55, 1]);
    const bottom = subplotRect(area, [0, 1], [0, 0.45]);
    expect(top).toEqual({ x: 80, y: 100, width: 540, height: 122 });
    expect(bottom).toEqual({ x: 80, y: 222 + 27, width: 540, height: 121 });
    const left = subplotRect(area, [0, 0.5], [0, 1]);
    const right = subplotRect(area, [0.5, 1], [0, 1]);
    expect(left.x + left.width).toBe(right.x);
  });

  it('accepts reversed domains', () => {
    expect(subplotRect(area, [1, 0], [1, 0])).toEqual(area);
  });
});

describe('ids', () => {
  it('splits cartesian subplot ids', () => {
    expect(splitSubplotId('xy')).toEqual(['x', 'y']);
    expect(splitSubplotId('x2y13')).toEqual(['x2', 'y13']);
    expect(splitSubplotId('scene')).toBeUndefined();
  });

  it('maps axis ids to layout keys', () => {
    expect(axisName('x')).toBe('xaxis');
    expect(axisName('y3')).toBe('yaxis3');
  });
});
