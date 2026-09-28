import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHierarchy, MULTIPLE_ROOTS_ID, type Hierarchy, type HierarchyInput } from './build.ts';

const EVE = {
  labels: ['Eve', 'Cain', 'Seth', 'Enos', 'Noam', 'Abel', 'Awan', 'Enoch', 'Azura'],
  parents: ['', 'Eve', 'Eve', 'Seth', 'Seth', 'Eve', 'Eve', 'Awan', 'Eve'],
  values: [10, 14, 12, 10, 2, 6, 6, 4, 4],
};

function build(input: Partial<HierarchyInput>) {
  return buildHierarchy({ labels: [], parents: [], type: 'sunburst', name: 'trace 0', ...input });
}

function tree(input: Partial<HierarchyInput>): Hierarchy {
  const { hierarchy, warnings } = build(input);
  expect(warnings).toEqual([]);
  return hierarchy!;
}

const byId = (h: Hierarchy, id: string) => h.nodes.find((n) => n.id === id)!;

describe('buildHierarchy: rows', () => {
  it('links children to parents in data order and orders nodes breadth first', () => {
    const h = tree({ ...EVE, sort: false });
    expect(h.root.id).toBe('Eve');
    expect(h.nodes.map((n) => n.id)).toEqual([
      'Eve',
      'Cain',
      'Seth',
      'Abel',
      'Awan',
      'Azura',
      'Enos',
      'Noam',
      'Enoch',
    ]);
    expect(byId(h, 'Seth').children.map((n) => n.id)).toEqual(['Enos', 'Noam']);
    expect(byId(h, 'Enos').depth).toBe(2);
    expect(h.root.height).toBe(2);
    expect(byId(h, 'Awan').height).toBe(1);
    expect(byId(h, 'Enoch').parent?.id).toBe('Awan');
    expect(h.hasImpliedRoot).toBe(false);
    expect(h.hasMultipleRoots).toBe(false);
  });

  it('keys nodes by ids when given, so labels may repeat', () => {
    const h = tree({
      ids: ['root', 'a', 'a/x', 'b', 'b/x'],
      labels: ['Root', 'A', 'X', 'B', 'X'],
      parents: ['', 'root', 'a', 'root', 'b'],
    });
    expect(h.nodes.map((n) => `${n.id}:${n.label}`)).toEqual([
      'root:Root',
      'a:A',
      'b:B',
      'a/x:X',
      'b/x:X',
    ]);
  });

  it('treats the number 0 as an id and a parent', () => {
    const h = tree({ ids: [0, 1, 2], labels: ['zero', 'one', 'two'], parents: ['', 0, 0] });
    expect(h.root.id).toBe('0');
    expect(h.root.children.map((n) => n.label)).toEqual(['one', 'two']);
  });

  it('adds the implied root when no row has an empty parent (Plotly)', () => {
    const h = tree({ labels: ['A', 'B', 'C'], parents: ['R', 'R', 'A'] });
    expect(h.hasImpliedRoot).toBe(true);
    expect(h.root).toMatchObject({ id: 'R', label: 'R', i: -1, generated: 'implied' });
    expect(h.root.children.map((n) => n.id)).toEqual(['A', 'B']);
  });

  it('holds several roots under a generated root', () => {
    const h = tree({ labels: ['A', 'B', 'a'], parents: ['', '', 'A'] });
    expect(h.hasMultipleRoots).toBe(true);
    expect(h.root).toMatchObject({
      id: MULTIPLE_ROOTS_ID,
      label: '',
      i: -1,
      generated: 'multiple',
    });
    expect(h.root.children.map((n) => n.id)).toEqual(['A', 'B']);
    expect(byId(h, 'A').pid).toBe(MULTIPLE_ROOTS_ID);
  });

  it('drops rows without an id and, with values, rows without a number ≥ 0', () => {
    const h = tree({
      labels: ['R', '', 'A', 'B', 'C', 'D'],
      parents: ['', 'R', 'R', 'R', 'R', 'R'],
      values: [0, 1, 2, -1, 'x', '3'],
    });
    expect(h.nodes.map((n) => n.id)).toEqual(['R', 'D', 'A']);
    expect(byId(h, 'D').v).toBe(3);
  });

  it('reads the shortest of ids / labels, parents and values', () => {
    const h = tree({ labels: ['R', 'A', 'B'], parents: ['', 'R'], values: [1, 2, 3] });
    expect(h.nodes.map((n) => n.id)).toEqual(['R', 'A']);
  });

  it('keeps repeated leaf ids (d3 allows them)', () => {
    const h = tree({ labels: ['R', 'A', 'A'], parents: ['', 'R', 'R'], values: [0, 1, 2] });
    expect(h.root.children.map((n) => n.v)).toEqual([2, 1]);
  });
});

describe('buildHierarchy: errors (Plotly warnings)', () => {
  it('several implied roots', () => {
    const r = build({ labels: ['A', 'B'], parents: ['X', 'Y'] });
    expect(r.hierarchy).toBeUndefined();
    expect(r.warnings).toEqual([
      'Multiple implied roots, cannot build sunburst hierarchy of trace 0. These roots include: X, Y',
    ]);
  });

  it('a missing parent', () => {
    const r = build({ labels: ['R', 'A', 'B'], parents: ['', 'R', 'Q'] });
    expect(r.hierarchy).toBeUndefined();
    expect(r.warnings).toEqual([
      'Failed to build sunburst hierarchy of trace 0. Error: missing: Q',
    ]);
  });

  it('a parent id used by several nodes', () => {
    const r = build({ labels: ['R', 'A', 'A', 'B'], parents: ['', 'R', 'R', 'A'] });
    expect(r.warnings).toEqual([
      'Failed to build sunburst hierarchy of trace 0. Error: ambiguous: A',
    ]);
  });

  it('a cycle, with or without a root', () => {
    const withRoot = build({ labels: ['R', 'A', 'B'], parents: ['', 'B', 'A'] });
    expect(withRoot.warnings).toEqual([
      'Failed to build sunburst hierarchy of trace 0. Error: cycle',
    ]);
    const rootless = build({ labels: ['A', 'B'], parents: ['B', 'A'], name: 'tree' });
    expect(rootless.warnings).toEqual(['Failed to build sunburst hierarchy of tree. Error: cycle']);
  });

  it('a `total` smaller than its children', () => {
    const r = build({ ...EVE, branchvalues: 'total' });
    expect(r.hierarchy).toBeUndefined();
    expect(r.warnings).toEqual([
      'Total value for node Eve is smaller than the sum of its children. \nparent value = 10 \nchildren sum = 42',
    ]);
  });

  it('no rows at all builds nothing, silently', () => {
    expect(build({ labels: ['A'], parents: ['R'], values: [-1] })).toEqual({
      hierarchy: undefined,
      warnings: [],
    });
  });
});

describe('buildHierarchy: values', () => {
  it("'remainder' adds each node's value to its descendants'", () => {
    const h = tree(EVE);
    expect(byId(h, 'Seth').value).toBe(24);
    expect(byId(h, 'Awan').value).toBe(10);
    expect(h.root.value).toBe(68);
    expect(byId(h, 'Seth').v).toBe(12);
  });

  it("'total' takes the node's own value; generated roots take their children's sum", () => {
    const h = tree({
      labels: ['A', 'B', 'a1', 'a2'],
      parents: ['', '', 'A', 'A'],
      values: [10, 5, 4, 5.999999999999],
      branchvalues: 'total',
    });
    expect(byId(h, 'A').value).toBe(10);
    expect(h.root.value).toBe(15);
    // Within Plotly's rounding tolerance.
    const almost = tree({
      labels: ['A', 'a1', 'a2'],
      parents: ['', 'A', 'A'],
      values: [0.3, 0.1, 0.2],
      branchvalues: 'total',
    });
    expect(almost.root.value).toBe(0.3);
  });

  it('counts leaves, branches or both without values', () => {
    const leaves = tree({ labels: EVE.labels, parents: EVE.parents });
    expect([leaves.root.value, byId(leaves, 'Seth').value, byId(leaves, 'Cain').value]).toEqual([
      6, 2, 1,
    ]);
    const branches = tree({ labels: EVE.labels, parents: EVE.parents, count: 'branches' });
    expect([
      branches.root.value,
      byId(branches, 'Seth').value,
      byId(branches, 'Cain').value,
    ]).toEqual([3, 1, 0]);
    const both = tree({ labels: EVE.labels, parents: EVE.parents, count: 'branches+leaves' });
    expect([both.root.value, byId(both, 'Seth').value, byId(both, 'Awan').value]).toEqual([
      9, 3, 2,
    ]);
  });

  it('sorts siblings by value, largest first, keeping ties in data order', () => {
    const h = tree(EVE);
    expect(h.root.children.map((n) => n.id)).toEqual(['Seth', 'Cain', 'Awan', 'Abel', 'Azura']);
    expect(h.nodes[1]!.id).toBe('Seth');
    const ties = tree({
      labels: ['R', 'a', 'b', 'c'],
      parents: ['', 'R', 'R', 'R'],
      values: [0, 1, 2, 1],
    });
    expect(ties.root.children.map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });
});

/** A random forest as labels / parents / values: each row's parent is an earlier row or ''. */
const forest = fc
  .array(fc.tuple(fc.nat(), fc.nat({ max: 100 }), fc.boolean()), { minLength: 1, maxLength: 40 })
  .map((rows) => {
    const labels: string[] = [];
    const parents: string[] = [];
    const values: number[] = [];
    rows.forEach(([p, v, top], i) => {
      labels.push(`n${i}`);
      parents.push(i === 0 || top ? '' : `n${p % i}`);
      values.push(v);
    });
    return { labels, parents, values };
  });

describe('buildHierarchy: properties', () => {
  it("'remainder' values are own value plus children, and every row is a node", () => {
    fc.assert(
      fc.property(forest, (rows) => {
        const h = tree(rows);
        const real = h.nodes.filter((n) => !n.generated);
        expect(real.length).toBe(rows.labels.length);
        for (const n of h.nodes) {
          const sum = n.children.reduce((a, c) => a + c.value, 0);
          expect(n.value).toBeCloseTo((n.v ?? 0) + sum, 9);
          for (const c of n.children) {
            expect(c.depth).toBe(n.depth + 1);
            expect(c.parent).toBe(n);
            expect(n.height).toBeGreaterThanOrEqual(c.height + 1);
          }
        }
      }),
    );
  });

  it('breadth-first order visits parents before their children, siblings sorted', () => {
    fc.assert(
      fc.property(forest, (rows) => {
        const h = tree(rows);
        const at = new Map(h.nodes.map((n, k) => [n, k]));
        for (const n of h.nodes) {
          if (n.parent) expect(at.get(n.parent)!).toBeLessThan(at.get(n)!);
          for (let k = 1; k < n.children.length; k++) {
            expect(n.children[k - 1]!.value).toBeGreaterThanOrEqual(n.children[k]!.value);
          }
        }
      }),
    );
  });
});
