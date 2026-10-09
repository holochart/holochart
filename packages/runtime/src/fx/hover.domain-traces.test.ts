/**
 * Finding hovered points when the figure has domain traces (pie: placed on the figure, no axes)
 * next to cartesian ones, and which points of a multi-label hover are kept. The cartesian subplot's
 * plot area is x 10–110, y 20–120 of a 200×200 figure.
 */
import { createScale, type FullAxis, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import type { AxisInfo, HoverPoint, HoverQuery, TraceModule } from '../contracts.ts';
import { HoverFinder, type DomainHover, type HoverEntry } from './hover.ts';

const TRANSFORM = { scaleX: 1, offsetX: 0, scaleY: 1, offsetY: 0, scaleZ: 1, offsetZ: 0 };
const PLOT = { x: 10, y: 20, width: 100, height: 100 };
const FIGURE = { x: 0, y: 0, width: 200, height: 200 };

type Hover = (query: HoverQuery) => HoverPoint[];

function axis(id: 'x' | 'y'): AxisInfo {
  const scale = createScale({ type: 'linear', range: [0, 10], length: 100 });
  return {
    id,
    name: `${id}axis`,
    letter: id,
    type: 'linear',
    full: { type: 'linear' } as unknown as FullAxis,
    scale,
    start: 0,
    end: 100,
    l2c: (l) => scale.l2p(l),
  };
}

const SUBPLOT = {
  id: 'xy',
  xaxis: axis('x'),
  yaxis: axis('y'),
  rect: PLOT,
} as unknown as NonNullable<HoverEntry['subplot']>;

/** A trace module that answers hover queries with `hover` (none: it has no hover). */
function moduleOf(hover: Hover | undefined): TraceModule {
  const hoverPoints = (_calc: unknown, _trace: FullTrace, query: HoverQuery): HoverPoint[] =>
    hover ? hover(query) : [];
  return (hover ? { hoverPoints } : {}) as unknown as TraceModule;
}

/** A trace on the cartesian subplot whose hover answers with `hover`. */
function cartesian(index: number, hover: Hover): HoverEntry {
  return {
    index,
    module: moduleOf(hover),
    trace: { type: 'dots' } as unknown as FullTrace,
    input: {},
    calc: undefined,
    subplot: SUBPLOT,
    rect: PLOT,
    ctx: {
      fullLayout: {} as FullLayout,
      xaxis: SUBPLOT.xaxis,
      yaxis: SUBPLOT.yaxis,
      transform: TRANSFORM,
    },
    skip: false,
  };
}

/** A domain trace: no subplot, measured in the whole figure. */
function domain(index: number, hover: Hover | undefined, skip = false): HoverEntry {
  return {
    index,
    module: moduleOf(hover),
    trace: { type: 'pie' } as unknown as FullTrace,
    input: {},
    calc: undefined,
    subplot: undefined,
    rect: FIGURE,
    ctx: { fullLayout: {} as FullLayout, xaxis: undefined, yaxis: undefined, transform: TRANSFORM },
    skip,
  };
}

function at(pointIndex: number, distance: number): HoverPoint {
  return { pointIndex, distance, px: 50, py: 50 };
}

function domains(...entries: HoverEntry[]): DomainHover {
  return { entries, height: FIGURE.height };
}

describe('hover over domain traces', () => {
  it('asks them in figure px from the bottom-left corner, in closest mode whatever the hovermode', () => {
    const queries: HoverQuery[] = [];
    const pie = domain(0, (q) => {
      queries.push({ ...q });
      return [at(2, 0)];
    });
    const finder = new HoverFinder();
    // The pointer is outside every subplot: domain traces are asked wherever it is.
    expect(finder.find([SUBPLOT], () => [], 150, 170, 'x unified', 20, domains(pie))).toBe(true);
    expect(queries).toEqual([
      { px: 150, py: 30, xl: 150, yl: 30, mode: 'closest', distance: 20, cx: 150, cy: 170 },
    ]);
    expect(finder.count).toBe(1);
    expect(finder.found[0]).toMatchObject({ entry: pie, point: { pointIndex: 2 } });
    expect(finder.subplot).toBeUndefined();
    // The same slice again: no change.
    expect(finder.find([SUBPLOT], () => [], 151, 170, 'x unified', 20, domains(pie))).toBe(false);
  });

  it('skips those with hoverinfo skip and those whose module has no hover', () => {
    const skipped = vi.fn(() => [at(0, 0)]);
    const pie = domain(2, () => [at(1, 0)]);
    const finder = new HoverFinder();
    finder.find(
      [],
      () => [],
      50,
      50,
      'closest',
      20,
      domains(domain(0, skipped, true), domain(1, undefined), pie),
    );
    expect(skipped).not.toHaveBeenCalled();
    expect(finder.count).toBe(1);
    expect(finder.found[0]?.entry).toBe(pie);
  });

  it('drops their points beyond the hover distance', () => {
    const finder = new HoverFinder();
    const far = domain(0, () => [at(0, 25), at(1, Number.NaN)]);
    expect(finder.find([], () => [], 50, 50, 'closest', 20, domains(far))).toBe(false);
    expect(finder.count).toBe(0);
  });

  it('lets a domain trace win a tie with a cartesian point: it is drawn on top', () => {
    const dots = cartesian(0, () => [at(0, 0)]);
    const pie = domain(1, () => [at(3, 0)]);
    const finder = new HoverFinder();
    finder.find([SUBPLOT], () => [dots], 60, 70, 'closest', 20, domains(pie));
    expect(finder.count).toBe(1);
    expect(finder.found[0]).toMatchObject({ entry: pie, point: { pointIndex: 3 } });
  });

  it('shows a winning domain trace alone in x mode: it has no axis label to share', () => {
    const a = cartesian(0, () => [at(0, 4)]);
    const b = cartesian(1, () => [at(0, 6)]);
    const pie = domain(2, () => [at(3, 0)]);
    const finder = new HoverFinder();
    finder.find([SUBPLOT], () => [a, b], 60, 70, 'x', 20, domains(pie));
    expect(finder.count).toBe(1);
    expect(finder.found[0]?.entry).toBe(pie);
    expect(finder.subplot).toBeUndefined();
    // Without the pie under the pointer, x mode keeps every trace's point.
    finder.find([SUBPLOT], () => [a, b], 60, 70, 'x', 20, domains(domain(2, () => [])));
    expect(finder.count).toBe(2);
    expect(finder.subplot).toBe(SUBPLOT);
  });

  it('keeps a nearer cartesian point over a domain point in closest mode', () => {
    const dots = cartesian(0, () => [at(7, 2)]);
    const pie = domain(1, () => [at(3, 9)]);
    const finder = new HoverFinder();
    finder.find([SUBPLOT], () => [dots], 60, 70, 'closest', 20, domains(pie));
    expect(finder.count).toBe(1);
    expect(finder.found[0]).toMatchObject({ entry: dots, point: { pointIndex: 7 } });
    expect(finder.subplot).toBe(SUBPLOT);
  });
});

describe('multi-label hover', () => {
  it('keeps the statistics of the winning trace and drops its other points', () => {
    const stat = (py: number): HoverPoint => ({
      pointIndex: -1,
      distance: 5,
      px: 50,
      py,
      multi: true,
    });
    // A box: two statistics and, as far away, one of its sample points.
    const outlier: HoverPoint = { pointIndex: 4, distance: 5, px: 50, py: 90 };
    const box = cartesian(0, () => [stat(10), outlier, stat(30)]);
    const finder = new HoverFinder();
    finder.find([SUBPLOT], () => [box], 60, 70, 'closest', 20);
    expect(finder.count).toBe(2);
    expect(
      finder.found
        .slice(0, 2)
        .map((f) => f.point.py)
        .sort((a, b) => a - b),
    ).toEqual([10, 30]);
  });
});
