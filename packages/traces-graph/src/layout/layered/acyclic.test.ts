import { describe, expect, it } from 'vitest';
import { feedbackLinks, isAcyclic } from './acyclic.ts';
import { ends, randomDagLinks, randomLinks, type LinkList } from './testing.ts';

/** Indices of the links marked. */
function marked(nodes: number, links: LinkList): number[] {
  const { source, target } = ends(links);
  const reversed = feedbackLinks(nodes, source, target);
  expect(isAcyclic(nodes, source, target, reversed)).toBe(true);
  return Array.from(reversed.keys()).filter((k) => reversed[k] === 1);
}

describe('layered layout: cycle breaking', () => {
  it('leaves an acyclic graph alone', () => {
    expect(
      marked(5, [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
        [3, 4],
        [0, 4],
      ]),
    ).toEqual([]);
    for (let seed = 1; seed <= 20; seed++) {
      expect(marked(40, randomDagLinks(40, 120, seed))).toEqual([]);
    }
  });

  it('opens a cycle at the link into its first node', () => {
    expect(
      marked(3, [
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    ).toEqual([2]);
    expect(
      marked(2, [
        [0, 1],
        [1, 0],
      ]),
    ).toEqual([1]);
  });

  it('never marks a self-link, and a graph of self-links needs nothing', () => {
    expect(
      marked(2, [
        [0, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toEqual([]);
    expect(
      marked(3, [
        [0, 0],
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    ).toEqual([3]);
  });

  it('turns one link where a depth-first search would turn n − 1', () => {
    // 0 → 1 → … → 9 and every node back to 0: turning 0 → 1 breaks every cycle.
    const links: [number, number][] = [];
    for (let i = 0; i < 9; i++) links.push([i, i + 1]);
    for (let i = 1; i < 10; i++) links.push([i, 0]);
    expect(marked(10, links)).toEqual([0]);
  });

  it('keeps the links between strong components, whatever the cycles on either side', () => {
    // Two triangles joined by 2 → 3 and 5 → 6, then a tail.
    const links: LinkList = [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 3],
      [5, 6],
      [6, 7],
    ];
    expect(marked(8, links)).toEqual([2, 6]);
  });

  it('turns exactly one link of each pair in a complete two-way graph', () => {
    const n = 6;
    const links: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) links.push([i, j]);
    expect(marked(n, links)).toHaveLength((n * (n - 1)) / 2);
  });

  it('counts parallel links separately and turns the lighter side', () => {
    // Two links 0 → 1 against one 1 → 0.
    expect(
      marked(2, [
        [1, 0],
        [0, 1],
        [0, 1],
      ]),
    ).toEqual([0]);
  });

  it('breaks every cycle of random graphs with at most half of the links', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const nodes = 5 + (seed % 30);
      const links = randomLinks(nodes, nodes * (1 + (seed % 4)), seed);
      const proper = links.filter(([s, t]) => s !== t).length;
      expect(marked(nodes, links).length).toBeLessThanOrEqual(proper / 2);
    }
  });

  it('is the same on every run and handles an empty graph', () => {
    const { source, target } = ends(randomLinks(50, 200, 7));
    expect(feedbackLinks(50, source, target)).toEqual(feedbackLinks(50, source, target));
    expect(feedbackLinks(0, new Int32Array(0), new Int32Array(0))).toHaveLength(0);
    expect(feedbackLinks(3, new Int32Array(0), new Int32Array(0))).toHaveLength(0);
  });
});
