import { describe, expect, it } from 'vitest';
import {
  cullLabels,
  directedPlacement,
  labelBox,
  labelPlacement,
  labelPriority,
  LABEL_GAP,
  nodePlacements,
  quadsTouch,
  type CullInput,
  type LabelPlacement,
  type LabelRule,
} from './labels.ts';

describe('label placement', () => {
  it('anchors the text so that it grows away from the node', () => {
    expect(labelPlacement('middle right')).toEqual({
      anchorX: 'left',
      anchorY: 'middle',
      dx: 1,
      dy: 0,
    });
    expect(labelPlacement('top left')).toEqual({
      anchorX: 'right',
      anchorY: 'bottom',
      dx: -1,
      dy: -1,
    });
    expect(labelPlacement('bottom center')).toEqual({
      anchorX: 'center',
      anchorY: 'top',
      dx: 0,
      dy: 1,
    });
    expect(labelPlacement('middle center')).toMatchObject({ dx: 0, dy: 0 });
  });
});

describe('label placement at an angle', () => {
  it('points the text away from the node along the direction', () => {
    expect(directedPlacement(3, 0)).toEqual({ anchorX: 'left', anchorY: 'middle', dx: 1, dy: 0 });
    expect(directedPlacement(0, -2)).toEqual({
      anchorX: 'center',
      anchorY: 'bottom',
      dx: 0,
      dy: -1,
    });
    const diagonal = directedPlacement(-1, 1);
    expect(diagonal).toMatchObject({ anchorX: 'right', anchorY: 'top' });
    expect(diagonal.dx).toBeCloseTo(-Math.SQRT1_2, 9);
    // No direction: to the right, like the default.
    expect(directedPlacement(0, 0)).toEqual(labelPlacement('middle right'));
  });

  it('gives a circular arrangement radial labels under auto, one placement otherwise', () => {
    const calc = {
      x: Float64Array.of(0, 10, 0, -10),
      y: Float64Array.of(10, 0, -10, 0),
      arrangement: 'circular',
    };
    const radial = nodePlacements('auto', calc, 2, 2);
    expect(typeof radial).toBe('function');
    const at = radial as (i: number) => ReturnType<typeof labelPlacement>;
    // Linear y is up: the top node's label goes up on screen (negative y).
    expect(at(0)).toMatchObject({ anchorX: 'center', anchorY: 'bottom', dy: -1 });
    expect(at(1)).toMatchObject({ anchorX: 'left', anchorY: 'middle', dx: 1 });
    expect(at(3)).toMatchObject({ anchorX: 'right', dx: -1 });
    // A reversed x axis mirrors the sides.
    const mirrored = nodePlacements('auto', calc, -2, 2) as typeof at;
    expect(mirrored(1)).toMatchObject({ anchorX: 'right', dx: -1 });
    expect(nodePlacements('top center', calc, 1, 1)).toEqual(labelPlacement('top center'));
    expect(nodePlacements('none', calc, 1, 1)).toBeUndefined();
    expect(nodePlacements('auto', { ...calc, arrangement: 'preset' }, 1, 1)).toEqual(
      labelPlacement('middle right'),
    );
    // Nodes without a position do not move the center; a single node has no direction.
    const three = { ...calc, x: Float64Array.of(0, 10, 0, NaN) };
    expect((nodePlacements('auto', three, 1, 1) as typeof at)(1).dx).toBeGreaterThan(0.9);
    const one = { ...calc, x: Float64Array.of(0, NaN, NaN, NaN) };
    expect(nodePlacements('auto', one, 1, 1)).toEqual(labelPlacement('middle right'));
  });
});

describe('label priority', () => {
  it('orders nodes by degree, then by index', () => {
    expect(Array.from(labelPriority(Int32Array.of(1, 5, 1, 9)))).toEqual([3, 1, 0, 2]);
  });
});

describe('label culling', () => {
  /** Nodes on a row at the given x, radius 5, labels 40 × 14 to the right. */
  function input(xs: readonly number[], extra: Partial<CullInput> = {}): CullInput {
    return {
      order: xs.map((_, i) => i),
      px: (i) => xs[i]!,
      py: () => 100,
      halfWidth: xs.map(() => 5),
      halfHeight: xs.map(() => 5),
      width: () => 40,
      height: 14,
      placement: labelPlacement('middle right'),
      view: { x0: 0, y0: 0, x1: 500, y1: 300 },
      ...extra,
    };
  }

  it('keeps labels that do not overlap', () => {
    expect(cullLabels(input([10, 100, 200]))).toEqual([0, 1, 2]);
  });

  it('drops a label that overlaps one placed before it: the first in priority wins', () => {
    // The label of node 0 spans x 18…58; node 1 at 30 would start inside it.
    expect(cullLabels(input([10, 30, 100]))).toEqual([0, 2]);
    expect(cullLabels(input([10, 30, 100], { order: [1, 0, 2] }))).toEqual([1, 2]);
  });

  it('brings the dropped label back once a zoom makes room', () => {
    const xs = [10, 30];
    expect(cullLabels(input(xs))).toEqual([0]);
    // Twice the scale: 20 and 60, and the first label ends at 20 + 5 + gap + 40.
    expect(cullLabels(input(xs.map((x) => x * 4)))).toEqual([0, 1]);
  });

  it('keeps a gap between labels', () => {
    const second = 10 + 5 + LABEL_GAP + 40;
    // Starting exactly where the first ends (its node's own offset aside) is inside the gap.
    expect(cullLabels(input([10, second - 5 - LABEL_GAP + 1]))).toEqual([0]);
    expect(cullLabels(input([10, second - 5 - LABEL_GAP + 1], { gap: 0 }))).toEqual([0, 1]);
  });

  it('skips nodes outside the view, hidden nodes and nodes without a label', () => {
    expect(cullLabels(input([10, 900]))).toEqual([0]);
    expect(cullLabels(input([10, 900], { margin: 500 }))).toEqual([0, 1]);
    expect(cullLabels(input([10, NaN, 200]))).toEqual([0, 2]);
    expect(cullLabels(input([10, 200], { width: (i) => (i === 0 ? 0 : 40) }))).toEqual([1]);
  });

  it('only measures the labels of nodes in the view', () => {
    const asked: number[] = [];
    cullLabels(
      input([10, 900, 200], {
        width: (i) => {
          asked.push(i);
          return 40;
        },
      }),
    );
    expect(asked).toEqual([0, 2]);
  });

  it('keeps labels off the nodes that rank before them', () => {
    // Node 1 sits where the label of node 2 (to its left) would go: with 2 last, it loses it.
    const xs = [300, 100, 70];
    const placement = labelPlacement('middle right');
    expect(cullLabels(input(xs, { placement }))).toEqual([0, 1]);
    // Ranked first, node 2 keeps its label over node 1, whose own label then collides with it.
    expect(cullLabels(input(xs, { order: [2, 1, 0] }))).toEqual([2, 0]);
    // With a node clear of the label of node 2, it is the node alone that decides.
    expect(cullLabels(input([300, 124, 70]))).toEqual([0, 1]);
    expect(cullLabels(input([300, 124, 70], { avoidNodes: false }))).toEqual([0, 1, 2]);
    // A node that ranks after the label does not push it out.
    expect(cullLabels(input([300, 124, 70], { order: [0, 2, 1] }))).toEqual([0, 2, 1]);
    // Without the node in the way, only the labels collide.
    expect(cullLabels(input([300, 160, 70], { avoidNodes: false }))).toEqual([0, 1, 2]);
  });

  it('takes one placement per node', () => {
    // Two nodes side by side: labels to the right collide, labels pointing apart do not.
    const xs = [100, 130];
    expect(cullLabels(input(xs))).toEqual([0]);
    const apart = cullLabels(
      input(xs, { placement: (i) => directedPlacement(i === 0 ? -1 : 1, 0) }),
    );
    expect(apart).toEqual([0, 1]);
  });

  it('stops at the limit', () => {
    expect(cullLabels(input([10, 100, 200], { max: 2 }))).toEqual([0, 1]);
  });

  it('places labels on every side of the node', () => {
    // Two nodes stacked 12 apart: labels above the nodes collide, labels to the sides do not.
    const stacked = (position: string) =>
      cullLabels({
        ...input([100, 100]),
        py: (i) => 100 + 12 * i,
        placement: labelPlacement(position),
      });
    expect(stacked('top center')).toEqual([0]);
    expect(stacked('bottom left')).toEqual([0]);
    const apart = cullLabels({
      ...input([100, 100]),
      py: (i) => 100 + 40 * i,
      placement: labelPlacement('top center'),
    });
    expect(apart).toEqual([0, 1]);
  });

  it('handles many labels in one pass', () => {
    const n = 20_000;
    const xs = Array.from({ length: n }, (_, i) => (i * 7919) % 2000);
    const kept = cullLabels({
      ...input(xs),
      py: (i) => (i * 104729) % 1200,
      view: { x0: 0, y0: 0, x1: 2000, y1: 1200 },
      avoidNodes: false,
    });
    // No two kept boxes overlap.
    const boxes = kept.map((i) => {
      const x0 = xs[i]! + 5 + LABEL_GAP;
      const y0 = ((i * 104729) % 1200) - 7;
      return [x0, y0, x0 + 40, y0 + 14] as const;
    });
    boxes.sort((a, b) => a[0] - b[0]);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length && boxes[b]![0] < boxes[a]![2]; b++) {
        const overlap = boxes[a]![1] < boxes[b]![3] && boxes[b]![1] < boxes[a]![3];
        expect(overlap).toBe(false);
      }
    }
    expect(kept.length).toBeGreaterThan(500);
  });
});

describe('labels that are turned', () => {
  it('boxes an upright label by its turned rectangle', () => {
    // Hanging under a node of radius 5: the text ends at the node and reads upwards.
    const down = { anchorX: 'right', anchorY: 'middle', dx: 0, dy: 1, angle: -90 } as const;
    const box = labelBox(down, 5, 5, 40, 10);
    expect(box.x0).toBeCloseTo(-5, 9);
    expect(box.x1).toBeCloseTo(5, 9);
    expect(box.y0).toBeCloseTo(5 + LABEL_GAP, 9);
    expect(box.y1).toBeCloseTo(5 + LABEL_GAP + 40, 9);
    // A quarter turn: the box is the text.
    expect(box.quad).toBeUndefined();
    // Standing on the node: it starts at the node.
    const up = labelBox({ ...down, anchorX: 'left', dy: -1 }, 5, 5, 40, 10);
    expect(up.y1).toBeCloseTo(-(5 + LABEL_GAP), 9);
    expect(up.y0).toBeCloseTo(-(5 + LABEL_GAP) - 40, 9);
  });

  it('keeps the corners of a label at another angle', () => {
    const box = labelBox(
      { anchorX: 'left', anchorY: 'middle', dx: 0, dy: 0, angle: 45 },
      0,
      0,
      40,
      10,
    );
    expect(box.quad).toHaveLength(8);
    // The box is around the corners, and larger than the text.
    expect(box.x1 - box.x0).toBeCloseTo((40 + 10) / Math.SQRT2, 9);
    expect(box.y1 - box.y0).toBeCloseTo((40 + 10) / Math.SQRT2, 9);
    // Clockwise on screen (y down): the text runs down and to the right.
    expect(box.quad![2]).toBeGreaterThan(box.quad![0]!);
    expect(box.quad![3]).toBeGreaterThan(box.quad![1]!);
    // A label that is not turned is its rectangle.
    expect(labelBox(labelPlacement('middle right'), 5, 5, 40, 10)).toEqual({
      x0: 5 + LABEL_GAP,
      y0: -5,
      x1: 5 + LABEL_GAP + 40,
      y1: 5,
    });
  });

  it('tells whether two turned rectangles touch', () => {
    const rect = (cx: number, cy: number, angle: number): number[] => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return [
        [-20, -5],
        [20, -5],
        [20, 5],
        [-20, 5],
      ].flatMap(([u, v]) => [cx + u! * c - v! * s, cy + u! * s + v! * c]);
    };
    const tilted = Math.PI / 4;
    // Two parallel slanted labels 14 px apart across their length: their boxes overlap, they do not.
    const a = rect(0, 0, tilted);
    const b = rect(-14 * Math.sin(tilted), 14 * Math.cos(tilted), tilted);
    expect(quadsTouch(a, b, 2)).toBe(false);
    expect(quadsTouch(a, b, 5)).toBe(true);
    expect(quadsTouch(a, rect(5, 5, tilted), 0)).toBe(true);
    expect(quadsTouch(a, rect(0, 0, -tilted), 0)).toBe(true);
    expect(quadsTouch(a, rect(200, 0, 0), 0)).toBe(false);
  });

  it('keeps slanted labels side by side that their boxes would cull', () => {
    // Four nodes on a line 16 px apart, labels fanned at 45°: 40 px wide boxes, 11 px of text.
    const slanted = { anchorX: 'left', anchorY: 'middle', dx: 0.7, dy: 0.7, angle: 45 } as const;
    const base = {
      order: [0, 1, 2, 3],
      px: (i: number) => 100 + i * 16,
      py: () => 100,
      halfWidth: [3, 3, 3, 3],
      halfHeight: [3, 3, 3, 3],
      width: () => 60,
      height: 9,
      view: { x0: 0, y0: 0, x1: 400, y1: 400 },
      avoidNodes: false,
    };
    expect(cullLabels({ ...base, placement: slanted })).toEqual([0, 1, 2, 3]);
    // Upright boxes of the same size in the same places do collide.
    const flat = { anchorX: 'left', anchorY: 'top', dx: 0.7, dy: 0.7 } as const;
    expect(cullLabels({ ...base, placement: flat }).length).toBeLessThan(4);
    // Slanted labels that really cross are culled: 6 px along the line is 4 px across the text.
    expect(cullLabels({ ...base, px: (i: number) => 100 + i * 6, placement: slanted })).toEqual([
      0, 3,
    ]);
  });
});

describe('where an arrangement has room for labels', () => {
  const at = (rule: LabelRule, i: number, scaleX = 1, scaleY = 1): LabelPlacement => {
    const placement = nodePlacements(
      'auto',
      { x: new Float64Array(4), y: new Float64Array(4), arrangement: 'tree', labelRule: rule },
      scaleX,
      scaleY,
    );
    return typeof placement === 'function' ? placement(i) : placement!;
  };
  const leaf = Uint8Array.of(0, 1);

  it('puts the labels of a sideways tree beyond the leaves and before the others', () => {
    const lr: LabelRule = { kind: 'tree', orientation: 'LR', leaf };
    expect(at(lr, 1)).toEqual(labelPlacement('middle right'));
    expect(at(lr, 0)).toEqual(labelPlacement('middle left'));
    const rl: LabelRule = { kind: 'tree', orientation: 'RL', leaf };
    expect(at(rl, 1)).toEqual(labelPlacement('middle left'));
    // An x axis that runs backwards mirrors the tree, and its labels.
    expect(at(lr, 1, -1)).toEqual(labelPlacement('middle left'));
  });

  it('turns the leaf labels of an upright tree upright', () => {
    const tb: LabelRule = { kind: 'tree', orientation: 'TB', leaf };
    expect(at(tb, 1)).toEqual({ anchorX: 'right', anchorY: 'middle', dx: 0, dy: 1, angle: -90 });
    expect(at(tb, 0)).toEqual(labelPlacement('middle right'));
    const bt: LabelRule = { kind: 'tree', orientation: 'BT', leaf };
    expect(at(bt, 1)).toEqual({ anchorX: 'left', anchorY: 'middle', dx: 0, dy: -1, angle: -90 });
    // The heights of a dendrogram on an axis that runs downwards: the leaves are at the top.
    expect(at(tb, 1, 1, -1)).toMatchObject({ dy: -1, anchorX: 'left' });
  });

  it('runs the labels of a radial tree along the radius, none upside down', () => {
    const rule: LabelRule = {
      kind: 'radial',
      angle: Float64Array.of(0, 0, 180, 90),
      radius: Float64Array.of(0, 100, 100, 100),
      leaf: Uint8Array.of(0, 1, 1, 0),
    };
    // The root, in the middle.
    expect(at(rule, 0)).toEqual(labelPlacement('top center'));
    // A leaf on the right: outwards, reading left to right.
    const right = at(rule, 1);
    expect(right).toMatchObject({ anchorX: 'left', anchorY: 'middle' });
    expect([right.dx, right.dy, right.angle]).toEqual([1, 0, 0]);
    // A leaf on the left: outwards too, turned round so that it reads left to right.
    const left = at(rule, 2);
    expect(left.anchorX).toBe('right');
    expect(left.dx).toBeCloseTo(-1, 9);
    expect(((left.angle! % 360) + 360) % 360).toBeCloseTo(0, 6);
    // A node with children at the top: inwards, which is down the screen.
    const top = at(rule, 3);
    expect(top.dy).toBeCloseTo(1, 9);
    expect(top.anchorX).toBe('right');
    expect(top.angle).toBeCloseTo(-90, 6);
  });

  it('puts the labels of an arc diagram on the side without arcs', () => {
    expect(at({ kind: 'arc', vertical: false, arcs: 'above' }, 0)).toMatchObject({
      dy: 1,
      angle: -90,
    });
    expect(at({ kind: 'arc', vertical: false, arcs: 'below' }, 0)).toMatchObject({ dy: -1 });
    expect(at({ kind: 'arc', vertical: true, arcs: 'above' }, 0)).toEqual(
      labelPlacement('middle left'),
    );
    expect(at({ kind: 'arc', vertical: true, arcs: 'below' }, 0)).toEqual(
      labelPlacement('middle right'),
    );
  });

  it('puts the labels of a hive plot beside their axis', () => {
    const rule: LabelRule = {
      kind: 'hive',
      axis: Int32Array.of(0, 1, 2, 7),
      axisAngle: Float64Array.of(90, 210, 0),
    };
    // Beside the axis that points up: to the right.
    expect(at(rule, 0)).toMatchObject({ anchorX: 'left', anchorY: 'middle' });
    // Beside a level axis: above it.
    expect(at(rule, 2)).toMatchObject({ anchorX: 'center', anchorY: 'bottom' });
    // The right-hand side of a slanted axis.
    expect(at(rule, 1).dx).toBeGreaterThan(0);
    // A node whose axis is unknown.
    expect(at(rule, 3)).toEqual(labelPlacement('middle right'));
  });

  it('gives way to a textposition the figure sets', () => {
    const rule: LabelRule = { kind: 'tree', orientation: 'LR', leaf };
    const placed = {
      x: new Float64Array(2),
      y: new Float64Array(2),
      arrangement: 'tree',
      labelRule: rule,
    };
    expect(nodePlacements('top center', placed, 1, 1)).toEqual(labelPlacement('top center'));
    expect(nodePlacements('none', placed, 1, 1)).toBeUndefined();
  });
});
