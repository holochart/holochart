import type { FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import {
  buildGraphModel,
  FAN_STEP,
  givenNodeCount,
  isTreeInput,
  labelFont,
  layoutGraphOf,
  nodeLabel,
} from './model.ts';

/** The model of a trace given as its defaulted attributes would be. */
const model = (trace: Record<string, unknown>) => buildGraphModel(trace as FullTrace);

describe('node count', () => {
  it('is the longest per-node array', () => {
    expect(givenNodeCount({ node: { label: ['a', 'b'], x: [1, 2, 3] } })).toBe(3);
    expect(givenNodeCount({ node: { size: [4, 4, 4, 4], color: 'red' } })).toBe(4);
    // One value for all nodes says nothing about their number.
    expect(givenNodeCount({ node: { size: 4, color: 'red' } })).toBe(0);
  });

  it('comes from the links when no node array is given', () => {
    expect(givenNodeCount({ link: { source: [0, 4], target: [1, 2] } })).toBe(5);
    expect(givenNodeCount({ link: { source: ['3'], target: [0] } })).toBe(4);
    // Ends that are no indices do not count.
    expect(givenNodeCount({ link: { source: [0, -1, 1.5, 'x'], target: [1, 9, 9, 9] } })).toBe(2);
    expect(givenNodeCount({ link: { source: [0] } })).toBe(0);
    expect(givenNodeCount({})).toBe(0);
  });

  it('is the row count of tree input', () => {
    const tree = { labels: ['r', 'a', 'b'], parents: ['', 'r', 'r'] };
    expect(isTreeInput(tree)).toBe(true);
    expect(givenNodeCount(tree)).toBe(3);
    expect(givenNodeCount({ ids: ['r', 'a', 'b', 'c'], parents: ['', 'r'] })).toBe(4);
    // Links of its own win over `parents`.
    expect(isTreeInput({ ...tree, link: { source: [0], target: [1] } })).toBe(false);
    expect(isTreeInput({ parents: [] })).toBe(false);
  });
});

describe('links', () => {
  it('keeps links between two nodes and counts the others', () => {
    const m = model({
      node: { label: ['a', 'b', 'c'] },
      link: {
        source: [0, 1, 5, -1, 2, 0.5],
        target: [1, 2, 0, 0, 7, 1],
        value: [2, '3', 1, 1, 1, 1],
      },
    });
    expect(m.nodes).toBe(3);
    expect(m.links).toBe(2);
    expect(m.dropped).toBe(4);
    expect(Array.from(m.source)).toEqual([0, 1]);
    expect(Array.from(m.target)).toEqual([1, 2]);
    expect(Array.from(m.linkIndex)).toEqual([0, 1]);
    expect(Array.from(m.value)).toEqual([2, 3]);
    expect(Array.from(m.weight)).toEqual([2, 3]);
  });

  it('weighs a link without a positive value as 1 and keeps the value as given', () => {
    const m = model({ link: { source: [0, 0, 0], target: [1, 1, 1], value: [0, -2, 'x'] } });
    expect(Array.from(m.weight)).toEqual([1, 1, 1]);
    expect(Array.from(m.value)).toEqual([0, -2, NaN]);
    const none = model({ link: { source: [0], target: [1] } });
    expect(none.value[0]).toBeNaN();
  });

  it('counts degrees, a self-link twice', () => {
    const m = model({ link: { source: [0, 0, 1, 2], target: [1, 2, 2, 2] } });
    expect(Array.from(m.outdegree)).toEqual([2, 1, 1]);
    expect(Array.from(m.indegree)).toEqual([0, 1, 3]);
    expect(Array.from(m.degree)).toEqual([2, 2, 4]);
  });

  it('fans parallel links out around straight and numbers self-links', () => {
    const m = model({
      link: { source: [0, 0, 1, 0, 2, 2, 1], target: [1, 1, 0, 1, 2, 2, 2] },
    });
    // Four links between 0 and 1: -1.5, -0.5, 0.5 and 1.5 steps seen from 0 → 1; the one from
    // 1 → 0 has its sign flipped, so it bows to the same side as its place in the fan.
    expect(Array.from(m.fan.subarray(0, 4), (v) => Math.round((v / FAN_STEP) * 10) / 10)).toEqual([
      -1.5, -0.5, -0.5, 1.5,
    ]);
    expect(Array.from(m.loop)).toEqual([-1, -1, -1, -1, 0, 1, -1]);
    // A single link is straight.
    expect(m.fan[6]).toBe(0);
  });

  it('gives two opposite links curvatures that bow apart', () => {
    const m = model({ link: { source: [0, 1], target: [1, 0] } });
    // The same sign: each bows to its own left, which are opposite sides.
    expect(m.fan[0]).toBeCloseTo(-FAN_STEP / 2, 6);
    expect(m.fan[1]).toBeCloseTo(-FAN_STEP / 2, 6);
  });
});

describe('tree input', () => {
  it('links every node to its parent, by id', () => {
    const m = model({
      ids: ['root', 'a', 'b', 'a1'],
      labels: ['Root', 'A', 'B', 'A one'],
      parents: ['', 'root', 'root', 'a'],
    });
    expect(m.nodes).toBe(4);
    expect(Array.from(m.parent!)).toEqual([-1, 0, 0, 1]);
    expect(Array.from(m.source)).toEqual([0, 0, 1]);
    expect(Array.from(m.target)).toEqual([1, 2, 3]);
    // A link's index is its child's row.
    expect(Array.from(m.linkIndex)).toEqual([1, 2, 3]);
    expect(nodeLabel(m, 3)).toBe('A one');
    expect(m.dropped).toBe(0);
  });

  it('uses labels as ids without `ids`, and takes 0 as an id', () => {
    const m = model({ labels: [0, 'x', 'y'], parents: ['', 0, 'x'] });
    expect(Array.from(m.parent!)).toEqual([-1, 0, 1]);
  });

  it('adds a node for a parent that is no row', () => {
    const m = model({ labels: ['a', 'b', 'c'], parents: ['top', 'top', 'side'] });
    expect(m.given).toBe(3);
    expect(m.nodes).toBe(5);
    expect(m.implied).toEqual(['top', 'side']);
    expect(Array.from(m.parent!)).toEqual([3, 3, 4, -1, -1]);
    expect(nodeLabel(m, 3)).toBe('top');
    expect(nodeLabel(m, 4)).toBe('side');
    expect(nodeLabel(m, 0)).toBe('a');
  });

  it('cuts a node that names itself and a cycle of parents', () => {
    const self = model({ labels: ['a', 'b'], parents: ['a', 'a'] });
    expect(Array.from(self.parent!)).toEqual([-1, 0]);
    expect(self.dropped).toBe(1);
    const cycle = model({ labels: ['a', 'b', 'c', 'd'], parents: ['c', 'a', 'b', 'a'] });
    // a → c → b → a closes: one link of the three is cut, and d still hangs under a.
    expect(cycle.links).toBe(3);
    expect(cycle.dropped).toBe(1);
    expect(cycle.parent![3]).toBe(0);
    for (let i = 0; i < 4; i++) {
      // Every chain of parents ends.
      let j = i;
      for (let steps = 0; j >= 0; steps++) {
        expect(steps).toBeLessThan(5);
        j = cycle.parent![j]!;
      }
    }
  });

  it('attaches children to the first row of a repeated id', () => {
    const m = model({ labels: ['a', 'a', 'b'], parents: ['', '', 'a'] });
    expect(m.parent![2]).toBe(0);
  });
});

describe('groups, sizes and labels', () => {
  it('numbers groups in order of first appearance', () => {
    const m = model({ node: { group: ['x', 'y', '', 'x', null, 2] } });
    expect(m.groupNames).toEqual(['x', 'y', '2']);
    expect(Array.from(m.group)).toEqual([0, 1, -1, 0, -1, 2]);
    expect(model({ node: { label: ['a'] } }).groupNames).toEqual([]);
  });

  it('takes sizes as given: one for all, or one per node', () => {
    expect(Array.from(model({ node: { label: ['a', 'b'], size: 14 } }).size)).toEqual([14, 14]);
    const each = model({ node: { size: [4, '8', -1, null] } });
    // What is no size is not drawn.
    expect(Array.from(each.size)).toEqual([4, 8, 0, 0]);
    expect(Array.from(each.halfWidth)).toEqual([2, 4, 0, 0]);
    expect(Array.from(model({ node: { label: ['a'] } }).size)).toEqual([10]);
  });

  it('sizes by degree: areas between the two diameters of sizerange', () => {
    const m = model({
      node: { sizeby: 'degree', sizerange: [10, 30] },
      link: { source: [0, 0, 0, 0], target: [1, 2, 3, 4] },
    });
    expect(m.size[0]).toBe(30);
    // A quarter of the largest count: half way in diameter.
    expect(m.size[1]).toBe(20);
    const inward = model({
      node: { label: ['a', 'b', 'c'], sizeby: 'indegree' },
      link: { source: [0, 1], target: [2, 2] },
    });
    expect(Array.from(inward.size)).toEqual([6, 6, 30]);
    const out = model({ node: { label: ['a', 'b'], sizeby: 'outdegree' } });
    expect(Array.from(out.size)).toEqual([6, 6]);
  });

  it('sizes box nodes to their labels', () => {
    const m = model({
      node: { label: ['A', 'A much longer label', ''], shape: 'box', textfont: { size: 12 } },
    });
    expect(m.box).toBe(true);
    expect(m.halfWidth[1]!).toBeGreaterThan(m.halfWidth[0]! + 30);
    expect(m.halfHeight[0]!).toBeGreaterThan(8);
    expect(m.halfHeight[0]).toBe(m.halfHeight[1]);
    // A box without a label has the smallest size.
    expect([m.halfWidth[2], m.halfHeight[2]]).toEqual([10, 8]);
    expect(m.size[1]).toBeCloseTo(2 * m.halfWidth[1]!, 3);
  });

  it('reads labels from node.label, else from the tree input', () => {
    const m = model({ node: { label: ['x', null, 3] } });
    expect([nodeLabel(m, 0), nodeLabel(m, 1), nodeLabel(m, 2)]).toEqual(['x', '', '3']);
    const tree = model({ labels: ['r', 'c'], parents: ['', 'r'] });
    expect(nodeLabel(tree, 1)).toBe('c');
    const own = model({ labels: ['r', 'c'], parents: ['', 'r'], node: { label: ['R', 'C'] } });
    expect(nodeLabel(own, 1)).toBe('C');
  });

  it('builds the label font from node.textfont', () => {
    expect(labelFont({})).toEqual({ family: 'sans-serif', size: 12 });
    expect(
      labelFont({
        node: {
          textfont: { family: 'Inter', size: 9, weight: 700, style: 'italic', shadow: 'auto' },
        },
      }),
    ).toEqual({ family: 'Inter', size: 9, weight: 700, style: 'italic', shadow: 'auto' });
    expect(labelFont({ node: { textfont: { shadow: 'none', style: 'normal' } } })).toEqual({
      family: 'sans-serif',
      size: 12,
    });
  });
});

describe('the graph a layout gets', () => {
  it('carries the links, the node extents, the given positions, groups and parents', () => {
    const m = model({
      node: { label: ['a', 'b'], group: ['g', 'g'], size: 8 },
      link: { source: [0], target: [1], value: [3] },
    });
    const x = Float64Array.of(1, NaN);
    const y = Float64Array.of(2, NaN);
    const g = layoutGraphOf(m, x, y);
    expect(g).toMatchObject({ nodes: 2, groups: 1 });
    expect(g.x).toBe(x);
    expect(Array.from(g.weight)).toEqual([3]);
    expect(Array.from(g.halfWidth)).toEqual([4, 4]);
    expect(g.parent).toBeUndefined();
    const tree = model({ labels: ['r', 'c'], parents: ['', 'r'] });
    const t = layoutGraphOf(tree, x, y);
    expect(Array.from(t.parent!)).toEqual([-1, 0]);
    expect(t.group).toBeUndefined();
  });
});
