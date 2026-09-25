import { createScale } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import {
  dragOutline,
  fromContainer,
  hitSelection,
  outlineEdits,
  selectionOutline,
  toContainer,
} from './geometry.ts';

/** x: linear 0–10 over container px 100–300; y: 0–10 over container px 250 (bottom) – 50. */
function axes(xType: 'linear' | 'date' = 'linear') {
  const xs = createScale({ type: xType, range: [0, 10], length: 200 });
  const ys = createScale({ type: 'linear', range: [0, 10], length: 200 });
  return {
    x: { type: xType, scale: xs, letter: 'x' as const, start: 100 },
    y: { type: 'linear' as const, scale: ys, letter: 'y' as const, start: 250 },
  };
}

describe('selection outlines', () => {
  const { x, y } = axes();

  it('maps linear ↔ container px along each axis', () => {
    expect(toContainer(x, 5)).toBe(200);
    expect(toContainer(y, 5)).toBe(150);
    expect(fromContainer(x, 200)).toBe(5);
    expect(fromContainer(y, 150)).toBe(5);
  });

  it('outlines a rect (sorted box) and a path, and skips incomplete ones', () => {
    const r = selectionOutline({ type: 'rect', x0: 4, x1: 1, y0: 2, y1: 5, _index: 3 }, x, y);
    expect(r?.box).toEqual([1, 4, 2, 5]);
    expect(r?.index).toBe(3);
    expect(r?.x).toEqual([1, 4, 4, 1]);
    const p = selectionOutline({ type: 'path', path: 'M1,1L5,1L3,4Z' }, x, y);
    expect(p?.box).toBeUndefined();
    expect(p?.x).toEqual([1, 5, 3]);
    expect(p?.index).toBe(-1);
    expect(selectionOutline({ type: 'rect', x0: 1, x1: 2 }, x, y)).toBeUndefined();
  });

  it('hits edges and corners of a box (resize), its inside (move), and misses outside', () => {
    const r = selectionOutline({ type: 'rect', x0: 1, x1: 4, y0: 2, y1: 5, _index: 0 }, x, y)!;
    // Box in px: x 120–180, y 150 (top) – 210 (bottom).
    expect(hitSelection(r, x, y, 150, 180)).toBe('move');
    expect(hitSelection(r, x, y, 180, 180)).toBe('resize-e');
    expect(hitSelection(r, x, y, 121, 151)).toBe('resize-nw');
    expect(hitSelection(r, x, y, 150, 212)).toBe('resize-s');
    expect(hitSelection(r, x, y, 250, 180)).toBeUndefined();
    const p = selectionOutline({ type: 'path', path: 'M1,1L5,1L3,4Z' }, x, y)!;
    expect(hitSelection(p, x, y, toContainer(x, 3), toContainer(y, 2))).toBe('move');
    expect(hitSelection(p, x, y, toContainer(x, 8), toContainer(y, 8))).toBeUndefined();
  });

  it('moves every vertex and resizes the grabbed edges, keeping the box sorted', () => {
    const r = selectionOutline({ type: 'rect', x0: 1, x1: 4, y0: 2, y1: 5, _index: 0 }, x, y)!;
    // 20 px right = +1 in x; 20 px down = -1 in y.
    expect(dragOutline(r, x, y, 'move', 20, 20).box).toEqual([2, 5, 1, 4]);
    expect(dragOutline(r, x, y, 'resize-e', 40, 0).box).toEqual([1, 6, 2, 5]);
    expect(dragOutline(r, x, y, 'resize-n', 0, -20).box).toEqual([1, 4, 2, 6]);
    // Dragging the left edge past the right one flips the box.
    expect(dragOutline(r, x, y, 'resize-w', 100, 0).box).toEqual([4, 6, 2, 5]);
    const p = selectionOutline({ type: 'path', path: 'M1,1L5,1L3,4Z' }, x, y)!;
    const moved = dragOutline(p, x, y, 'move', 20, -20);
    expect(moved.x).toEqual([2, 6, 4]);
    expect(moved.y).toEqual([2, 2, 5]);
  });

  it("writes Plotly's relayout edits, round-tripping through the outline", () => {
    const r = selectionOutline({ type: 'rect', x0: 1, x1: 4, y0: 2, y1: 5, _index: 1 }, x, y)!;
    expect(outlineEdits(dragOutline(r, x, y, 'move', 20, 0), x, y)).toEqual({
      'selections[1].x0': 2,
      'selections[1].x1': 5,
      'selections[1].y0': 2,
      'selections[1].y1': 5,
    });
    const d = axes('date');
    const t0 = Date.parse('2024-03-01');
    const p = selectionOutline(
      { type: 'path', path: `M${t0},1L${t0 + 43_200_000},5L${t0 + 86_400_000},1Z`, _index: 0 },
      d.x,
      d.y,
    )!;
    const edits = outlineEdits(p, d.x, d.y);
    expect(edits).toEqual({
      'selections[0].path': 'M2024-03-01,1L2024-03-01_12:00,5L2024-03-02,1Z',
    });
    const again = selectionOutline(
      { type: 'path', path: edits['selections[0].path'] as string },
      d.x,
      d.y,
    );
    expect(again?.x).toEqual(p.x);
  });
});
