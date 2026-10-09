import { describe, expect, it } from 'vitest';
import { labelPlacement } from '../graph/labels.ts';
import { cullLabels3d, type Label3dInput } from './labels.ts';

const VIEW = { x0: 0, y0: 0, x1: 400, y1: 300 };

function input(
  nodes: readonly (readonly [number, number, number])[],
  over: Partial<Label3dInput> = {},
): Label3dInput {
  return {
    order: nodes.map((_, i) => i),
    x: nodes.map((n) => n[0]),
    y: nodes.map((n) => n[1]),
    radius: nodes.map((n) => n[2]),
    width: () => 40,
    height: 12,
    placement: labelPlacement('middle right'),
    view: VIEW,
    ...over,
  };
}

describe('graph3d label culling', () => {
  it('keeps the labels that have room, in priority order', () => {
    // Three nodes in a column, 30 px apart: every label is clear of the others.
    const column = [
      [100, 100, 5],
      [100, 130, 5],
      [100, 160, 5],
    ] as const;
    expect(cullLabels3d(input(column))).toEqual([0, 1, 2]);
    // 8 px apart: the first of two neighbours keeps its label.
    const close = [
      [100, 100, 3],
      [100, 108, 3],
      [100, 116, 3],
    ] as const;
    expect(cullLabels3d(input(close))).toEqual([0, 2]);
    expect(cullLabels3d(input(close, { order: [1, 0, 2] }))).toEqual([1]);
    expect(cullLabels3d(input(column, { max: 2 }))).toEqual([0, 1]);
  });

  it('a node is in the way of every label, whatever its rank and whether it is a candidate', () => {
    // The second node sits where the label of the first would be.
    const blocked = [
      [100, 100, 5],
      [130, 100, 6],
    ] as const;
    expect(cullLabels3d(input(blocked))).toEqual([1]);
    expect(cullLabels3d(input(blocked, { order: [0] }))).toEqual([]);
    // On the other side of the node there is room.
    expect(
      cullLabels3d(input(blocked, { placement: labelPlacement('middle left'), order: [0] })),
    ).toEqual([0]);
    // A label keeps clear of its own node by the gap, at any radius.
    expect(cullLabels3d(input([[100, 100, 40]]))).toEqual([0]);
  });

  it('leaves out labels that would be cut by the edge of the scene, and nodes off screen', () => {
    const nodes = [
      [380, 100, 4],
      [200, 295, 4],
      [NaN, NaN, 0],
      [200, 150, 4],
      [-50, 100, 4],
    ] as const;
    expect(cullLabels3d(input(nodes))).toEqual([3]);
    expect(cullLabels3d(input(nodes, { placement: labelPlacement('top left') }))).toEqual([
      0, 1, 3,
    ]);
  });

  it('nodes without a label take no room for one', () => {
    const nodes = [
      [100, 100, 5],
      [100, 104, 5],
    ] as const;
    expect(cullLabels3d(input(nodes, { width: (i) => (i === 0 ? 0 : 40) }))).toEqual([1]);
  });
});
