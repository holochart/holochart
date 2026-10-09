import { describe, expect, it } from 'vitest';
import {
  FULL_LOD,
  LOD,
  lodApplies,
  lodMeasures,
  lodMode,
  lodOf,
  lodStats,
  nextLod,
  sameLod,
  setLod,
  type GraphLod,
  type LodStats,
} from './lod.ts';
import type { GraphCalc } from './calc.ts';
import type { GraphModel } from './model.ts';

/** A model of `n` nodes of one size on a square grid, each linked to its right neighbour. */
function gridModel(
  side: number,
  size = 10,
): { model: GraphModel; x: Float64Array; y: Float64Array } {
  const n = side * side;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const source: number[] = [];
  const target: number[] = [];
  for (let i = 0; i < n; i++) {
    x[i] = (i % side) * 10;
    y[i] = Math.floor(i / side) * 10;
    if (i % side < side - 1) {
      source.push(i);
      target.push(i + 1);
    }
  }
  const model = {
    nodes: n,
    links: source.length,
    source: Int32Array.from(source),
    target: Int32Array.from(target),
    size: new Float32Array(n).fill(size),
    box: false,
  } as unknown as GraphModel;
  return { model, x, y };
}

const statsOf = (side: number, size = 10): LodStats => {
  const { model, x, y } = gridModel(side, size);
  return lodStats({ x, y, hidden: new Uint8Array(model.nodes) }, model);
};

describe('lodMode and lodApplies', () => {
  it("reads the trace's lod, 'auto' for anything else", () => {
    expect(lodMode({ lod: true })).toBe(true);
    expect(lodMode({ lod: false })).toBe(false);
    expect(lodMode({ lod: 'auto' })).toBe('auto');
    expect(lodMode({})).toBe('auto');
  });

  it("'auto' applies above the node or the link count, true always, false never", () => {
    expect(lodApplies('auto', LOD.nodes, LOD.links)).toBe(false);
    expect(lodApplies('auto', LOD.nodes + 1, 0)).toBe(true);
    expect(lodApplies('auto', 10, LOD.links + 1)).toBe(true);
    expect(lodApplies(true, 3, 2)).toBe(true);
    expect(lodApplies(false, 1e6, 1e6)).toBe(false);
  });
});

describe('lodStats', () => {
  it('measures the box, the mean size and the mean link extents of what is drawn', () => {
    const { model, x, y } = gridModel(5, 8);
    const stats = lodStats({ x, y, hidden: new Uint8Array(25) }, model);
    expect(stats.nodes).toBe(25);
    expect(stats.width).toBe(40);
    expect(stats.height).toBe(40);
    expect(stats.meanSize).toBe(8);
    expect(stats.links).toBe(20);
    expect(stats.meanLength).toBe(10);
    expect(stats.meanDx).toBe(10);
    expect(stats.meanDy).toBe(0);
    expect(stats.meanWidth).toBe(1);
    // Too few nodes for a grid of cells: the whole box counts.
    expect(stats.occupied).toBe(1);
  });

  it('leaves out hidden nodes, nodes without a position and their links', () => {
    const { model, x, y } = gridModel(5);
    const hidden = new Uint8Array(25);
    hidden[0] = 1;
    x[24] = NaN;
    const stats = lodStats({ x, y, hidden }, model);
    expect(stats.nodes).toBe(23);
    // The links 0→1 and 23→24.
    expect(stats.links).toBe(18);
  });

  it('takes the mean of the given link widths', () => {
    const { model, x, y } = gridModel(3);
    const widths = new Float32Array(model.links).fill(3);
    expect(lodStats({ x, y, hidden: new Uint8Array(9) }, model, widths).meanWidth).toBe(3);
  });

  it('counts the part of the box the nodes occupy: clusters are measured by themselves', () => {
    // 4,000 nodes in two tight corners of a box 1,000 wide.
    const n = 4000;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const corner = i % 2;
      x[i] = corner * 950 + (i % 50);
      y[i] = corner * 950 + (Math.floor(i / 50) % 50);
    }
    const model = {
      nodes: n,
      links: 0,
      source: new Int32Array(0),
      target: new Int32Array(0),
      size: new Float32Array(n).fill(6),
    } as unknown as GraphModel;
    const stats = lodStats({ x, y, hidden: new Uint8Array(n) }, model);
    expect(stats.occupied).toBeGreaterThan(0);
    expect(stats.occupied).toBeLessThan(0.05);
    // The same nodes spread over the whole box occupy all of it.
    for (let i = 0; i < n; i++) {
      x[i] = (i % 64) * 15.6;
      y[i] = Math.floor(i / 64) * 15.9;
    }
    expect(lodStats({ x, y, hidden: new Uint8Array(n) }, model).occupied).toBeGreaterThan(0.9);
  });
});

describe('lodMeasures', () => {
  it('follows the zoom: spacing and link length in proportion, coverage in inverse proportion', () => {
    const stats = statsOf(20);
    const one = lodMeasures(stats, 1, 1);
    const two = lodMeasures(stats, 2, 2);
    expect(one.spacing).toBeCloseTo(Math.sqrt((190 * 190) / 400), 10);
    expect(two.spacing).toBeCloseTo(2 * one.spacing, 10);
    expect(one.linkLength).toBe(10);
    expect(two.linkLength).toBe(20);
    expect(two.coverage).toBeCloseTo(one.coverage / 2, 10);
  });

  it('measures under any pair of axis scales, and ignores their signs', () => {
    const stats = statsOf(20);
    const m = lodMeasures(stats, -3, 0.5);
    expect(m.linkLength).toBe(30);
    expect(m.spacing).toBeCloseTo(Math.sqrt((190 * 3 * 190 * 0.5) / 400), 10);
  });

  it('gives no measure a threshold would act on for degenerate input', () => {
    const none = lodMeasures(statsOf(1), 1, 1);
    expect(none.spacing).toBe(Infinity);
    expect(none.linkLength).toBe(Infinity);
    expect(none.coverage).toBe(0);
    expect(lodMeasures(statsOf(5), 0, 1).spacing).toBe(Infinity);
    expect(lodMeasures(statsOf(5), NaN, 1).coverage).toBe(0);
  });

  it('measures the length of links that run along the axes as it is, at one scale', () => {
    // Half the links along x, half along y, all 10 long.
    const stats: LodStats = {
      ...statsOf(20),
      links: 100,
      meanLength: 10,
      meanDx: 5,
      meanDy: 5,
    };
    expect(lodMeasures(stats, 3, 3).linkLength).toBeCloseTo(30, 10);
    // And between the two scales when they differ.
    const mixed = lodMeasures(stats, 3, 1).linkLength;
    expect(mixed).toBeGreaterThan(10);
    expect(mixed).toBeLessThan(30);
  });

  it('spaces nodes on one line along it', () => {
    const { model, x } = gridModel(10);
    const stats = lodStats({ x, y: new Float64Array(100), hidden: new Uint8Array(100) }, model);
    expect(stats.height).toBe(0);
    expect(lodMeasures(stats, 2, 2).spacing).toBeCloseTo((90 * 2) / 99, 10);
  });
});

describe('nextLod', () => {
  const stats = { meanSize: 10 };
  const at = (spacing: number, linkLength = 100, coverage = 0) => ({
    spacing,
    linkLength,
    coverage,
  });

  it('draws everything when there is room', () => {
    const lod = nextLod(undefined, at(100), stats);
    expect(sameLod(lod, FULL_LOD)).toBe(true);
  });

  it('turns labels on at the upper threshold and off below the lower one', () => {
    let lod: GraphLod | undefined;
    lod = nextLod(lod, at(LOD.labelsOff - 1), stats);
    expect(lod.labels).toBe(false);
    // In between: as before.
    lod = nextLod(lod, at((LOD.labelsOn + LOD.labelsOff) / 2), stats);
    expect(lod.labels).toBe(false);
    lod = nextLod(lod, at(LOD.labelsOn), stats);
    expect(lod.labels).toBe(true);
    lod = nextLod(lod, at((LOD.labelsOn + LOD.labelsOff) / 2), stats);
    expect(lod.labels).toBe(true);
    lod = nextLod(lod, at(LOD.labelsOff - 0.01), stats);
    expect(lod.labels).toBe(false);
  });

  it('turns arrowheads on and off by the mean link length, with the same two sides', () => {
    let lod: GraphLod | undefined;
    lod = nextLod(lod, at(100, LOD.arrowsOff - 1), stats);
    expect(lod.arrows).toBe(false);
    lod = nextLod(lod, at(100, LOD.arrowsOn - 1), stats);
    expect(lod.arrows).toBe(false);
    lod = nextLod(lod, at(100, LOD.arrowsOn), stats);
    expect(lod.arrows).toBe(true);
    lod = nextLod(lod, at(100, LOD.arrowsOff), stats);
    expect(lod.arrows).toBe(true);
    lod = nextLod(lod, at(100, LOD.arrowsOff - 0.01), stats);
    expect(lod.arrows).toBe(false);
  });

  it('does not flicker while the zoom wanders around a threshold', () => {
    let lod: GraphLod | undefined = nextLod(undefined, at(LOD.labelsOn + 1), stats);
    let flips = 0;
    for (let step = 0; step < 100; step++) {
      // Between the two sides of the threshold, back and forth.
      const spacing = LOD.labelsOff + 0.5 + ((step * 7) % 5);
      const next = nextLod(lod, at(spacing), stats);
      if (next.labels !== lod.labels) flips++;
      lod = next;
    }
    expect(flips).toBe(0);
  });

  it('draws nodes smaller where they are closer than `fill` times their size', () => {
    // 10 px nodes 7.5 px apart: half their size puts them 1.5 sizes apart again.
    const lod = nextLod(undefined, at(7.5), stats);
    expect(lod.nodeScale).toBeCloseTo(0.5, 10);
    expect(lod.points).toBe(false);
    expect(nextLod(undefined, at(LOD.fill * 10), stats).nodeScale).toBe(1);
  });

  it('never draws a node under the size of a point, and says when all are points', () => {
    const lod = nextLod(undefined, at(0.5), stats);
    expect(lod.nodeScale).toBeCloseTo(LOD.point / 10, 10);
    expect(lod.points).toBe(true);
    expect(lod.outlines).toBe(false);
  });

  it('drops the outlines first, below a drawn size, and brings them back above another', () => {
    // 10 px nodes drawn at 4.5 px: between the two sides.
    const between = (LOD.fill * (LOD.outlinesOn + LOD.outlinesOff)) / 2;
    expect(nextLod(undefined, at(between), stats).outlines).toBe(true);
    let lod = nextLod(undefined, at(LOD.fill * (LOD.outlinesOff - 0.5)), stats);
    expect(lod.outlines).toBe(false);
    expect(lod.points).toBe(false);
    lod = nextLod(lod, at(between), stats);
    expect(lod.outlines).toBe(false);
    lod = nextLod(lod, at(LOD.fill * LOD.outlinesOn), stats);
    expect(lod.outlines).toBe(true);
  });

  it('fades the links in inverse proportion to their coverage, down to a floor', () => {
    expect(nextLod(undefined, at(100, 100, LOD.coverage), stats).linkAlpha).toBe(1);
    expect(nextLod(undefined, at(100, 100, 4 * LOD.coverage), stats).linkAlpha).toBeCloseTo(
      0.25,
      10,
    );
    expect(nextLod(undefined, at(100, 100, 1e9), stats).linkAlpha).toBe(LOD.alphaMin);
  });

  it('moves the two factors in steps, not with every zoom', () => {
    const first = nextLod(undefined, at(7.5, 100, 4 * LOD.coverage), stats);
    // Two percent on: the same factors.
    const near = nextLod(first, at(7.5 * 1.02, 100, (4 * LOD.coverage) / 1.02), stats);
    expect(near.nodeScale).toBe(first.nodeScale);
    expect(near.linkAlpha).toBe(first.linkAlpha);
    expect(sameLod(near, first)).toBe(true);
    // Ten percent on: new ones.
    const far = nextLod(first, at(7.5 * 1.1, 100, (4 * LOD.coverage) / 1.1), stats);
    expect(far.nodeScale).toBeGreaterThan(first.nodeScale);
    expect(far.linkAlpha).toBeGreaterThan(first.linkAlpha);
  });

  it('leaves box nodes their labels, outlines and size', () => {
    const lod = nextLod(undefined, at(1, 1, 100), stats, true);
    expect(lod.labels).toBe(true);
    expect(lod.outlines).toBe(true);
    expect(lod.nodeScale).toBe(1);
    expect(lod.arrows).toBe(false);
    expect(lod.linkAlpha).toBeLessThan(1);
  });
});

describe('lodOf', () => {
  it('is everything until a view says otherwise, and again when it says so', () => {
    const calc = {} as GraphCalc;
    expect(lodOf(calc)).toBe(FULL_LOD);
    const lod = { ...FULL_LOD, labels: false };
    setLod(calc, lod);
    expect(lodOf(calc)).toBe(lod);
    setLod(calc, FULL_LOD);
    expect(lodOf(calc)).toBe(FULL_LOD);
  });
});
