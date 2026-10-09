import { describe, expect, it } from 'vitest';
import { makeGraph } from './__testing__/graphs.ts';
import { prepareLinks } from './links.ts';

describe('force layout: prepared links', () => {
  it('drops self-links and links to nodes that do not exist', () => {
    const links = prepareLinks(
      makeGraph(3, [
        [0, 0],
        [0, 1],
        [1, 7],
        [-1, 2],
      ]),
    );
    expect(links.count).toBe(1);
    expect([...links.source]).toEqual([0]);
    expect([...links.target]).toEqual([1]);
    expect([...links.degree]).toEqual([1, 1, 0]);
  });

  it('merges parallel and opposite links into one, summing the weights', () => {
    const links = prepareLinks(
      makeGraph(3, [
        [0, 1, 1],
        [1, 0, 2],
        [0, 1, 3],
        [1, 2, 2],
      ]),
    );
    expect(links.count).toBe(2);
    expect([...links.source]).toEqual([0, 1]);
    expect([...links.target]).toEqual([1, 2]);
    // Weights 6 and 2, relative to the median (the upper of the two).
    expect([...links.weight]).toEqual([1, 2 / 6]);
    // Distinct neighbours, not links.
    expect([...links.degree]).toEqual([1, 2, 1]);
  });

  it('sorts by lower then higher node, whatever the order given', () => {
    const list = [
      [3, 1],
      [2, 0],
      [1, 0],
      [3, 0],
      [2, 1],
    ] as const;
    const a = prepareLinks(makeGraph(4, list));
    const b = prepareLinks(makeGraph(4, [...list].reverse()));
    expect([...a.source]).toEqual([0, 0, 0, 1, 1]);
    expect([...a.target]).toEqual([1, 2, 3, 2, 3]);
    expect(b).toEqual(a);
  });

  it('gives equal weights a relative weight of 1, whatever their unit', () => {
    const links = prepareLinks(
      makeGraph(3, [
        [0, 1, 1e300],
        [1, 2, 1e300],
      ]),
    );
    expect([...links.weight]).toEqual([1, 1]);
  });

  it('takes the median as the unit, so one heavy link leaves the others at 1', () => {
    const links = prepareLinks(
      makeGraph(5, [
        [0, 1, 2],
        [1, 2, 2],
        [2, 3, 2],
        [3, 4, 200],
      ]),
    );
    expect([...links.weight]).toEqual([1, 1, 1, 100]);
  });

  it('keeps weights finite when they span more than a double can divide', () => {
    const links = prepareLinks(
      makeGraph(4, [
        [0, 1, 1e308],
        [1, 2, 1e-300],
        [2, 3, 1e-320],
      ]),
    );
    expect([...links.weight].every(Number.isFinite)).toBe(true);
    expect(links.weight[0]).toBeGreaterThan(links.weight[1]!);
  });

  it('reads a weight that is not a positive finite number as 1', () => {
    const links = prepareLinks(
      makeGraph(5, [
        [0, 1, NaN],
        [1, 2, -3],
        [2, 3, Infinity],
        [3, 4, 0],
      ]),
    );
    expect([...links.weight]).toEqual([1, 1, 1, 1]);
  });

  it('numbers connected components by their lowest node', () => {
    const links = prepareLinks(
      makeGraph(7, [
        [5, 6],
        [1, 3],
        [3, 4],
        [4, 1],
      ]),
    );
    expect([...links.component]).toEqual([0, 1, 2, 1, 1, 3, 3]);
    expect(links.components).toBe(4);
  });

  it('handles an empty graph', () => {
    const links = prepareLinks(makeGraph(0));
    expect(links.count).toBe(0);
    expect(links.components).toBe(0);
  });
});
