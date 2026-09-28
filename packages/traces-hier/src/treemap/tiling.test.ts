import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHierarchy, type Hierarchy } from '../hierarchy/build.ts';
import type { PartitionCell } from '../hierarchy/levels.ts';
import { treemapPartition, type TreemapPacking, type TreemapTiling } from './tiling.ts';

const PACKINGS: TreemapPacking[] = [
  'squarify',
  'binary',
  'dice',
  'slice',
  'slice-dice',
  'dice-slice',
];
const NO_PAD = { inner: 0, top: 0, left: 0, right: 0, bottom: 0 };

function tree(values: number[], parents?: string[]): Hierarchy {
  return buildHierarchy({
    labels: values.map((_, i) => `n${i}`),
    parents: parents ?? values.map((_, i) => (i === 0 ? '' : 'n0')),
    values,
    branchvalues: 'total',
    type: 'treemap',
    name: 't',
  }).hierarchy!;
}

const area = (c: PartitionCell): number => (c.x1 - c.x0) * (c.y1 - c.y0);
const aspect = (c: PartitionCell): number => {
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  return Math.max(w / h, h / w);
};
const cellOf = (cells: PartitionCell[], id: string) => cells.find((c) => c.node.id === id)!;

/** A random tree with `total` values: each node's value is its children's sum, leaves ≥ 1. */
const arbTree = fc
  .array(fc.tuple(fc.nat(), fc.integer({ min: 1, max: 60 })), { minLength: 2, maxLength: 40 })
  .map((rows) => {
    const parents = rows.map(([p], i) => (i === 0 ? '' : `n${p % i}`));
    const values = rows.map(([, v]) => v);
    // Bottom up: a branch is worth its children.
    const children = new Map<number, number[]>();
    parents.forEach((p, i) => {
      if (i > 0) children.set(Number(p.slice(1)), [...(children.get(Number(p.slice(1))) ?? []), i]);
    });
    for (let i = rows.length - 1; i >= 0; i--) {
      const kids = children.get(i);
      if (kids) values[i] = kids.reduce((s, k) => s + values[k]!, 0);
    }
    return tree(values, parents);
  });

describe('treemap tilings', () => {
  it.each(PACKINGS)('%s: children tile their parent, areas proportional to values', (packing) => {
    const h = tree([100, 40, 25, 15, 10, 6, 4]);
    const cells = treemapPartition(h.root, 400, 300, { packing, pad: NO_PAD });
    expect(cells[0]).toMatchObject({ x0: 0, y0: 0, x1: 400, y1: 300 });
    for (const c of cells.slice(1)) {
      expect(area(c)).toBeCloseTo((400 * 300 * c.node.value) / 100, 6);
      expect(c.x0).toBeGreaterThanOrEqual(-1e-9);
      expect(c.y1).toBeLessThanOrEqual(300 + 1e-9);
    }
    expect(cells.slice(1).reduce((s, c) => s + area(c), 0)).toBeCloseTo(400 * 300, 6);
  });

  it('dice lays siblings side by side, slice stacks them, slice-dice alternates by level', () => {
    const h = tree([10, 5, 5, 2, 3], ['', 'n0', 'n0', 'n1', 'n1']);
    const dice = treemapPartition(h.root, 100, 50, { packing: 'dice', pad: NO_PAD });
    expect(cellOf(dice, 'n1')).toMatchObject({ x0: 0, x1: 50, y0: 0, y1: 50 });
    expect(cellOf(dice, 'n2')).toMatchObject({ x0: 50, x1: 100 });
    const slice = treemapPartition(h.root, 100, 50, { packing: 'slice', pad: NO_PAD });
    expect(cellOf(slice, 'n1')).toMatchObject({ x0: 0, x1: 100, y0: 0, y1: 25 });
    const sd = treemapPartition(h.root, 100, 50, { packing: 'slice-dice', pad: NO_PAD });
    // Level 1 diced (side by side), level 2 sliced (stacked), larger values first.
    expect(cellOf(sd, 'n1')).toMatchObject({ x0: 0, x1: 50, y0: 0, y1: 50 });
    expect(cellOf(sd, 'n4')).toMatchObject({ x0: 0, x1: 50, y0: 0, y1: 30 });
    expect(cellOf(sd, 'n3')).toMatchObject({ x0: 0, x1: 50, y0: 30, y1: 50 });
    const ds = treemapPartition(h.root, 100, 50, { packing: 'dice-slice', pad: NO_PAD });
    // Transposed: level 1 stacked, level 2 side by side.
    expect(cellOf(ds, 'n1')).toMatchObject({ x0: 0, x1: 100, y0: 0, y1: 25 });
    expect(cellOf(ds, 'n4')).toMatchObject({ x0: 0, x1: 60, y0: 0, y1: 25 });
  });

  it('squarify makes squares of equal values in a square, and the ratio stretches them', () => {
    const h = tree([4, 1, 1, 1, 1]);
    const cells = treemapPartition(h.root, 100, 100, { packing: 'squarify', pad: NO_PAD });
    for (const c of cells.slice(1)) expect(aspect(c)).toBeCloseTo(1, 9);
    const worst = (ratio: number): number => {
      const t = tree([60, 20, 13, 9, 7, 5, 3, 2, 1]);
      const cs = treemapPartition(t.root, 300, 200, {
        packing: 'squarify',
        squarifyratio: ratio,
        pad: NO_PAD,
      });
      return Math.max(...cs.slice(1).map(aspect));
    };
    expect(worst(1)).toBeLessThan(2.5);
    expect(worst(1)).toBeLessThanOrEqual(worst(4));
  });

  it('binary splits by half the value across the longer side', () => {
    const h = tree([10, 5, 3, 2]);
    const cells = treemapPartition(h.root, 200, 100, { packing: 'binary', pad: NO_PAD });
    expect(cellOf(cells, 'n1')).toMatchObject({ x0: 0, x1: 100, y0: 0, y1: 100 });
    expect(cellOf(cells, 'n2')).toMatchObject({ x0: 100, x1: 200, y0: 0, y1: 60 });
  });

  it('pads branches (marker.pad) and siblings (tiling.pad) like d3', () => {
    const h = tree([10, 5, 5]);
    const pad = { inner: 4, top: 20, left: 6, right: 6, bottom: 6 };
    const cells = treemapPartition(h.root, 212, 126, { packing: 'dice', pad });
    // Inside the root's padding (6 px sides, 20 px top) with 4 px between siblings.
    expect(cellOf(cells, 'n1')).toMatchObject({ x0: 6, x1: 104, y0: 20, y1: 120 });
    expect(cellOf(cells, 'n2')).toMatchObject({ x0: 108, x1: 206, y0: 20, y1: 120 });
  });

  it('flips along x and y, keeping the header padding on top', () => {
    const h = tree([10, 7, 3]);
    const pad = { inner: 0, top: 10, left: 0, right: 0, bottom: 0 };
    const plain = treemapPartition(h.root, 100, 60, { packing: 'dice', pad });
    const x = treemapPartition(h.root, 100, 60, { packing: 'dice', flipX: true, pad });
    const y = treemapPartition(h.root, 100, 60, { packing: 'dice', flipY: true, pad });
    expect(cellOf(plain, 'n1')).toMatchObject({ x0: 0, x1: 70, y0: 10, y1: 60 });
    expect(cellOf(x, 'n1')).toMatchObject({ x0: 30, x1: 100, y0: 10, y1: 60 });
    expect(cellOf(y, 'n1')).toMatchObject({ x0: 0, x1: 70, y0: 10, y1: 60 });
  });

  it('collapses tiles too small for their padding to their center', () => {
    const h = tree([10, 9.99, 0.01, 0.006, 0.004], ['', 'n0', 'n0', 'n2', 'n2']);
    const pad = { inner: 0, top: 20, left: 4, right: 4, bottom: 4 };
    const cells = treemapPartition(h.root, 100, 100, { packing: 'dice', pad });
    const tiny = cellOf(cells, 'n3');
    expect(tiny.x1 - tiny.x0).toBe(0);
  });

  it.each(PACKINGS)(
    '%s: tiles nest in their parents and siblings do not overlap (property)',
    (packing) => {
      fc.assert(
        fc.property(arbTree, fc.integer({ min: 0, max: 4 }), (h, inner) => {
          const opts: TreemapTiling = {
            packing,
            squarifyratio: 1.5,
            pad: { inner, top: 3, left: 2, right: 2, bottom: 2 },
          };
          const cells = treemapPartition(h.root, 300, 200, opts);
          const byNode = new Map(cells.map((c) => [c.node, c]));
          const eps = 1e-6;
          for (const c of cells) {
            const parent = c.node.parent && byNode.get(c.node.parent);
            // Tiles of parents too small for their padding collapse around it (d3).
            if (!parent || !(c.x1 > c.x0 && c.y1 > c.y0)) continue;
            expect(c.x0).toBeGreaterThanOrEqual(parent.x0 - eps);
            expect(c.x1).toBeLessThanOrEqual(parent.x1 + eps);
            expect(c.y0).toBeGreaterThanOrEqual(parent.y0 - eps);
            expect(c.y1).toBeLessThanOrEqual(parent.y1 + eps);
          }
          for (const n of h.nodes) {
            const kids = n.children.map((k) => byNode.get(k)!);
            for (let a = 0; a < kids.length; a++) {
              for (let b = a + 1; b < kids.length; b++) {
                const p = kids[a]!;
                const q = kids[b]!;
                const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
                const oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
                expect(ox <= eps || oy <= eps).toBe(true);
              }
            }
          }
        }),
      );
    },
  );

  it('areas stay proportional to values without padding (property)', () => {
    fc.assert(
      fc.property(arbTree, fc.constantFrom(...PACKINGS), (h, packing) => {
        const cells = treemapPartition(h.root, 300, 200, { packing, pad: NO_PAD });
        for (const c of cells) {
          expect(area(c)).toBeCloseTo((300 * 200 * c.node.value) / h.root.value, 3);
        }
      }),
    );
  });
});
