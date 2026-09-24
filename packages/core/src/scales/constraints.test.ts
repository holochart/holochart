import { describe, expect, it } from 'vitest';
import {
  enforceConstraints,
  FROM_BL,
  scaleZoom,
  type ConstraintAxisState,
  type ConstraintGroup,
} from './constraints.ts';

const PLOT = { width: 1000, height: 500 };

function axis(
  range: [number, number],
  length: number,
  opts: Partial<ConstraintAxisState> = {},
): ConstraintAxisState {
  return {
    range,
    domain: [0, 1],
    length,
    constrain: 'range',
    constraintoward: 'center',
    ...opts,
  };
}

const enforce = (
  groups: ConstraintGroup[],
  axes: Record<string, ConstraintAxisState>,
  plot = PLOT,
) => enforceConstraints(groups, new Map(Object.entries(axes)), plot);

/** px per unit of an axis state with an updated range / domain. */
function pxPerUnit(ax: ConstraintAxisState, range = ax.range, domain = ax.domain): number {
  const len = (ax.length * (domain[1] - domain[0])) / (ax.domain[1] - ax.domain[0]);
  return len / Math.abs(range[1] - range[0]);
}

describe('scaleZoom / FROM_BL', () => {
  it('scales a range about a fraction of it', () => {
    expect(scaleZoom([0, 10], 2, 0.5)).toEqual([-5, 15]);
    expect(scaleZoom([0, 10], 2, 0)).toEqual([0, 20]);
    expect(scaleZoom([0, 10], 0.5, 1)).toEqual([5, 10]);
    // Reversed: the fraction runs from range[0].
    expect(scaleZoom([10, 0], 2, 0)).toEqual([10, -10]);
  });

  it('maps constraintoward to fractions from the left / bottom', () => {
    expect(FROM_BL).toEqual({ left: 0, center: 0.5, right: 1, bottom: 0, middle: 0.5, top: 1 });
  });
});

describe('enforceConstraints (Plotly enforce)', () => {
  it('leaves equal scales alone', () => {
    const r = enforce([{ x: 1, y: 1 }], {
      x: axis([0, 10], 500),
      y: axis([0, 5], 250, { constraintoward: 'middle' }),
    });
    expect(r.ranges.size).toBe(0);
    expect(r.domains.size).toBe(0);
    // Within the 1e-6 tolerance too.
    const near = enforce([{ x: 1, y: 1 }], { x: axis([0, 10], 500), y: axis([0, 10], 500.0001) });
    expect(near.ranges.size).toBe(0);
  });

  it("'range' widens the more zoomed-in axis to the most zoomed-out scale", () => {
    const x = axis([0, 10], 500); // 50 px/unit
    const y = axis([0, 10], 250, { constraintoward: 'middle' }); // 25 px/unit
    const r = enforce([{ x: 1, y: 1 }], { x, y });
    expect(r.ranges.get('x')).toEqual([-5, 15]);
    expect(r.ranges.has('y')).toBe(false);
    expect(pxPerUnit(x, r.ranges.get('x'))).toBeCloseTo(pxPerUnit(y));
  });

  it('widens about constraintoward', () => {
    const y = axis([0, 10], 250);
    const at = (toward: string) =>
      enforce([{ x: 1, y: 1 }], {
        x: axis([0, 10], 500, { constraintoward: toward }),
        y,
      }).ranges.get('x');
    expect(at('left')).toEqual([0, 20]);
    expect(at('right')).toEqual([-10, 10]);
    expect(at('center')).toEqual([-5, 15]);
  });

  it('zooms shrinkable axes in to match the axes whose range was set', () => {
    // An x-only zoom: x now shows [0, 5] (100 px/unit), y was not set.
    const groups = [{ x: 1, y: 1 }];
    const x = axis([0, 5], 500);
    const at = (toward: string) =>
      enforce(groups, {
        x,
        y: axis([0, 10], 500, { constraintoward: toward, shrinkable: true }),
      });
    const r = at('middle');
    expect(r.ranges.get('y')).toEqual([2.5, 7.5]);
    expect(r.ranges.has('x')).toBe(false);
    expect(at('top').ranges.get('y')).toEqual([5, 10]);
    expect(at('bottom').ranges.get('y')).toEqual([0, 5]);
    // Not shrinkable: x widens instead.
    const fixed = enforce(groups, { x, y: axis([0, 10], 500) });
    expect(fixed.ranges.get('x')).toEqual([-2.5, 7.5]);
    expect(fixed.ranges.has('y')).toBe(false);
  });

  it('treats a group where every axis is shrinkable as none shrinkable', () => {
    const r = enforce([{ x: 1, y: 1 }], {
      x: axis([0, 10], 500, { shrinkable: true }),
      y: axis([0, 10], 250, { shrinkable: true }),
    });
    expect(r.ranges.get('x')).toEqual([-5, 15]);
  });

  it('handles reversed ranges', () => {
    const x = axis([0, 10], 250);
    const r = enforce([{ x: 1, y: 1 }], {
      x,
      y: axis([10, 0], 500, { constraintoward: 'middle' }),
    });
    expect(r.ranges.get('y')).toEqual([15, -5]);
    const bottom = enforce([{ x: 1, y: 1 }], {
      x,
      y: axis([10, 0], 500, { constraintoward: 'bottom' }),
    });
    // range[0] (10) stays at the bottom.
    expect(bottom.ranges.get('y')).toEqual([10, -10]);
  });

  it('applies scaleratio', () => {
    // yaxis: { scaleanchor: 'x', scaleratio: 2 } → { y: 2, x: 1 }.
    const x = axis([0, 10], 500);
    const y = axis([0, 10], 500, { constraintoward: 'middle' });
    const r = enforce([{ y: 2, x: 1 }], { x, y });
    expect(r.ranges.get('x')).toEqual([-5, 15]);
    expect(r.ranges.has('y')).toBe(false);
    // One unit on y is twice as long as on x.
    expect(pxPerUnit(y) / pxPerUnit(x, r.ranges.get('x'))).toBeCloseTo(2);
  });

  it('resolves prefixed ratios with the plot aspect', () => {
    // y matches x with twice the domain: ratio 'y2' → 2 · height / width = 1 here.
    const r = enforce([{ y: 'y2', x: 1 }], { x: axis([0, 10], 500), y: axis([0, 10], 500) });
    expect(r.ranges.size).toBe(0);
    const wide = enforce(
      [{ y: 'y2', x: 1 }],
      { x: axis([0, 10], 500), y: axis([0, 10], 500) },
      { width: 500, height: 500 },
    );
    // Ratio 2: y must be twice as dense as x, so x widens.
    expect(wide.ranges.get('x')).toEqual([-5, 15]);
    const xPrefixed = enforce([{ x: 'x2', y: 1 }], {
      x: axis([0, 10], 500),
      y: axis([0, 10], 500),
    });
    // 'x2' → 2 / aspect = 4: x must be 4× as dense as y.
    expect(xPrefixed.ranges.get('y')).toEqual([-15, 25]);
  });

  it('solves three-axis groups', () => {
    const r = enforce([{ x: 1, x2: 1, y: 1 }], {
      x: axis([0, 10], 500), // 50
      x2: axis([0, 10], 200), // 20
      y: axis([0, 10], 400), // 40
    });
    expect(r.ranges.has('x2')).toBe(false);
    expect(r.ranges.get('x')).toEqual([-7.5, 17.5]);
    expect(r.ranges.get('y')).toEqual([-5, 15]);
  });

  it("'domain' shrinks the domain about constraintoward", () => {
    const y = axis([0, 10], 250, { constraintoward: 'middle' }); // 25 px/unit
    const at = (toward: string) =>
      enforce([{ x: 1, y: 1 }], {
        x: axis([0, 10], 500, { constrain: 'domain', constraintoward: toward }),
        y,
      });
    const r = at('center');
    expect(r.domains.get('x')).toEqual([0.25, 0.75]);
    expect(r.ranges.size).toBe(0);
    expect(at('left').domains.get('x')).toEqual([0, 0.5]);
    expect(at('right').domains.get('x')).toEqual([0.5, 1]);
    // A partial domain shrinks within itself.
    const part = enforce([{ x: 1, y: 1 }], {
      x: axis([0, 10], 500, { constrain: 'domain', domain: [0.2, 0.6] }),
      y,
    });
    expect(part.domains.get('x')?.[0]).toBeCloseTo(0.3);
    expect(part.domains.get('x')?.[1]).toBeCloseTo(0.5);
  });

  it("'domain' axes set the target scale even when shrinkable", () => {
    // Growing a domain cannot magnify, so a domain axis never zooms in (factor < 1): it is the
    // reference, and the range-constrained axis widens instead.
    const r = enforce([{ x: 1, y: 1 }], {
      x: axis([0, 10], 250, { constrain: 'domain', shrinkable: true }), // 25
      y: axis([0, 10], 500, { shrinkable: true }), // 50
    });
    expect(r.domains.size).toBe(0);
    expect(r.ranges.get('y')).toEqual([-5, 15]);
    // Equal scales with a domain axis: processed, nothing changes.
    const eq = enforce([{ x: 1, y: 1 }], {
      x: axis([0, 10], 500, { constrain: 'domain' }),
      y: axis([0, 10], 500, { constrain: 'domain' }),
    });
    expect(eq.domains.size + eq.ranges.size).toBe(0);
  });

  it('merged groups from conflicting anchors are solved together', () => {
    // xaxis.scaleanchor 'y', xaxis2.scaleanchor 'y2', yaxis2.scaleanchor 'x' → one group.
    const r = enforce([{ x: 1, y: 1, x2: 1, y2: 1 }], {
      x: axis([0, 10], 500),
      y: axis([0, 10], 500),
      x2: axis([0, 10], 250),
      y2: axis([0, 10], 500),
    });
    expect([...r.ranges.keys()].sort()).toEqual(['x', 'y', 'y2']);
  });

  it('ignores axes it has no state for, and degenerate axes', () => {
    const r = enforce([{ x: 1, y: 1, x9: 1 }], {
      x: axis([0, 10], 500),
      y: axis([0, 10], 250),
      bad: axis([1, 1], 100),
    });
    expect(r.ranges.get('x')).toEqual([-5, 15]);
    const degenerate = enforce([{ x: 1, y: 1 }], { x: axis([1, 1], 500), y: axis([0, 10], 250) });
    expect(degenerate.ranges.size).toBe(0);
    expect(enforce([], {}).ranges.size).toBe(0);
  });
});
