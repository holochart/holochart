import { describe, expect, it } from 'vitest';
import {
  buildLinkGeometry,
  distanceToLink,
  extendTail,
  geometryStale,
  patchLinkGeometry,
  Points,
  splitGeometry,
  type LinkGeometryInput,
} from './geometry.ts';

/** Nodes at the given points with radius 10; links as [source, target] pairs. */
function input(
  points: readonly (readonly [number, number])[],
  links: readonly (readonly [number, number])[],
  extra: Partial<LinkGeometryInput> = {},
): LinkGeometryInput {
  const n = points.length;
  return {
    x: Float64Array.from(points, (p) => p[0]),
    y: Float64Array.from(points, (p) => p[1]),
    hidden: new Uint8Array(n),
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    halfWidth: new Float64Array(n).fill(10),
    halfHeight: new Float64Array(n).fill(10),
    box: false,
    curve: new Float32Array(links.length),
    loop: new Int32Array(links.length).fill(-1),
    arrowEnd: false,
    arrowStart: false,
    arrowSize: new Float32Array(links.length).fill(8),
    scaleX: 1,
    scaleY: 1,
    ...extra,
  };
}

const IDENTITY = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

describe('link geometry', () => {
  it('draws straight links center to center, one polyline each', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
          [100, 50],
        ],
        [
          [0, 1],
          [1, 2],
        ],
      ),
    );
    expect(Array.from(g.x)).toEqual([0, 100, 100, 100]);
    expect(Array.from(g.y)).toEqual([0, 0, 0, 50]);
    // The first polyline starts at 0 by definition: `starts` lists the others.
    expect(Array.from(g.starts)).toEqual([2]);
    expect(Array.from(g.offsets)).toEqual([0, 2, 4]);
    expect(g.arrows.count).toBe(0);
    expect(g.depends).toBe('none');
  });

  it('leaves out links of hidden nodes and of nodes without a position', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
          [NaN, 0],
        ],
        [
          [0, 1],
          [1, 2],
          [0, 1],
        ],
        {
          hidden: Uint8Array.of(0, 0, 0),
        },
      ),
    );
    expect(Array.from(g.offsets)).toEqual([0, 2, 2, 4]);
    const hidden = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [[0, 1]],
        { hidden: Uint8Array.of(0, 1) },
      ),
    );
    expect(hidden.x).toHaveLength(0);
    expect(Array.from(hidden.offsets)).toEqual([0, 0]);
  });

  it('bows a curved link to the left of its direction by its curvature', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [
          [0, 1],
          [1, 0],
        ],
        { curve: Float32Array.of(0.2, 0.2) },
      ),
    );
    expect(g.depends).toBe('aspect');
    const count = g.offsets[1]!;
    expect(count).toBeGreaterThan(8);
    // Left of +x is +y: the apex is 0.2 × 100 above the middle of the chord.
    const mid = (count - 1) / 2;
    expect(g.x[mid]).toBeCloseTo(50, 6);
    expect(g.y[mid]).toBeCloseTo(20, 4);
    // The opposite link bows to its own left, the other side: the two do not overlap.
    const back = g.offsets[1]! + mid;
    expect(g.y[back]).toBeCloseTo(-20, 4);
    expect([g.x[0], g.y[0]]).toEqual([0, 0]);
    expect([g.x[count - 1], g.y[count - 1]]).toEqual([100, 0]);
  });

  it('bows at right angles on screen when the axis scales differ', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [10, 0],
        ],
        [[0, 1]],
        { curve: Float32Array.of(0.5), scaleX: 10, scaleY: 2 },
      ),
    );
    const mid = (g.offsets[1]! - 1) / 2;
    // 100 px long on screen, so the apex is 50 px up: 25 units of y at 2 px per unit.
    expect(g.x[mid]).toBeCloseTo(5, 6);
    expect(g.y[mid]).toBeCloseTo(25, 4);
  });

  it('draws a self-link as a loop that leaves and returns to its node', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [
          [0, 0],
          [0, 1],
        ],
        { loop: Int32Array.of(0, -1) },
      ),
    );
    expect(g.depends).toBe('scale');
    const end = g.offsets[1]! - 1;
    expect([g.x[0], g.y[0]]).toEqual([0, 0]);
    expect(g.x[end]).toBeCloseTo(0, 9);
    expect(g.y[end]).toBeCloseTo(0, 9);
    // The neighbour is to the right: the loop points left, and reaches beyond the node.
    let minX = Infinity;
    for (let i = 0; i <= end; i++) minX = Math.min(minX, g.x[i]!);
    expect(minX).toBeLessThan(-20);
    expect(minX).toBeCloseTo(-(10 + 14), 0);
  });

  it('points the loop of a lone node up, and stacks further loops outside the first', () => {
    const g = buildLinkGeometry(
      input(
        [[0, 0]],
        [
          [0, 0],
          [0, 0],
        ],
        { loop: Int32Array.of(0, 1) },
      ),
    );
    const top = (k: number): number => {
      let max = -Infinity;
      for (let i = g.offsets[k]!; i < g.offsets[k + 1]!; i++) max = Math.max(max, g.y[i]!);
      return max;
    };
    expect(top(0)).toBeCloseTo(24, 0);
    expect(top(1)).toBeCloseTo(32, 0);
  });

  it('points a loop away from the side of its label', () => {
    const top = (labelSide: LinkGeometryInput['labelSide']): [number, number] => {
      const g = buildLinkGeometry(input([[0, 0]], [[0, 0]], { loop: Int32Array.of(0), labelSide }));
      const mid = (g.offsets[1]! - 1) / 2;
      return [Math.round(g.x[mid]!), Math.round(g.y[mid]!)];
    };
    // Up without a label; down when the label is above; left when it is to the right.
    expect(top(undefined)).toEqual([0, 24]);
    expect(top(() => [0, 1])).toEqual([0, -24]);
    expect(top(() => [1, 0])).toEqual([-24, 0]);
    // A label outweighs one neighbour: with both to the right the loop still goes left, and
    // with the neighbour to the left and the label to the right it goes left too.
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [-100, 0],
        ],
        [
          [0, 0],
          [0, 1],
        ],
        {
          loop: Int32Array.of(0, -1),
          labelSide: () => [1, 0],
        },
      ),
    );
    expect(g.x[(g.offsets[1]! - 1) / 2]).toBeCloseTo(-24, 0);
  });

  it('samples a long spline route', () => {
    // Four cubic pieces: 13 control points.
    const points = new Float64Array(26);
    for (let i = 0; i < 13; i++) {
      points[2 * i] = i * 10;
      points[2 * i + 1] = i % 2 === 0 ? 0 : 20;
    }
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [120, 0],
        ],
        [[0, 1]],
        { routes: [{ kind: 'spline', points }] },
      ),
    );
    expect(g.offsets[1]).toBe(1 + 4 * 12);
    expect([g.x[48], g.y[48]]).toEqual([120, 0]);
  });

  it('stops an arrowhead at the edge of its node and ends the line inside the head', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [[0, 1]],
        { arrowEnd: true },
      ),
    );
    expect(g.depends).toBe('scale');
    expect(g.arrows.count).toBe(1);
    // The tip touches the circle of radius 10 around the target.
    expect(g.arrows.x[0]).toBeCloseTo(90, 3);
    expect(g.arrows.y[0]).toBeCloseTo(0, 6);
    // Pointing right is 90° clockwise from up.
    expect(g.arrows.angle[0]).toBeCloseTo(90, 3);
    expect(g.arrows.size[0]).toBe(8);
    expect(Array.from(g.arrows.link)).toEqual([0]);
    // The line stops 0.7 of the head's length before the tip, and still starts at the source.
    expect(g.x[1]).toBeCloseTo(90 - 0.7 * 8, 3);
    expect(g.x[0]).toBe(0);
  });

  it('puts heads at both ends, each pointing at its node', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [0, 100],
        ],
        [[0, 1]],
        { arrowEnd: true, arrowStart: true },
      ),
    );
    expect(g.arrows.count).toBe(2);
    // Target end: up. Source end: down.
    expect(g.arrows.y[0]).toBeCloseTo(90, 3);
    expect(Math.abs(g.arrows.angle[0]!)).toBeCloseTo(0, 3);
    expect(g.arrows.y[1]).toBeCloseTo(10, 3);
    expect(Math.abs(g.arrows.angle[1]!)).toBeCloseTo(180, 3);
    expect(g.y[0]).toBeCloseTo(10 + 5.6, 3);
    expect(g.y[1]).toBeCloseTo(90 - 5.6, 3);
  });

  it('follows the scale: the offset of the tip is a size in px', () => {
    const at = (scale: number) =>
      buildLinkGeometry(
        input(
          [
            [0, 0],
            [100, 0],
          ],
          [[0, 1]],
          { arrowEnd: true, scaleX: scale, scaleY: scale },
        ),
      ).arrows.x[0]!;
    expect(at(1)).toBeCloseTo(90, 3);
    expect(at(2)).toBeCloseTo(95, 3);
    // A reversed axis keeps the tip on the near side of the target.
    expect(at(-2)).toBeCloseTo(95, 3);
  });

  it('cuts at the rectangle of a box node', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
          [0, 100],
        ],
        [
          [0, 1],
          [0, 2],
        ],
        {
          arrowEnd: true,
          box: true,
          halfWidth: Float64Array.of(30, 30, 30),
          halfHeight: Float64Array.of(10, 10, 10),
        },
      ),
    );
    expect(g.arrows.x[0]).toBeCloseTo(70, 3);
    expect(g.arrows.y[1]).toBeCloseTo(90, 3);
  });

  it('puts the head of a curved link and of a loop on the node, along the curve', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [
          [0, 1],
          [1, 1],
        ],
        {
          arrowEnd: true,
          curve: Float32Array.of(0.3, 0),
          loop: Int32Array.of(-1, 0),
        },
      ),
    );
    expect(g.arrows.count).toBe(2);
    for (let a = 0; a < 2; a++) {
      const d = Math.hypot(g.arrows.x[a]! - 100, g.arrows.y[a]!);
      expect(d).toBeCloseTo(10, 2);
    }
    // The curve arrives from above the chord: the head points down and to the right.
    expect(g.arrows.angle[0]).toBeGreaterThan(90);
    expect(g.arrows.angle[0]).toBeLessThan(180);
  });

  it('draws nothing where two nodes leave no room for a head', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [15, 0],
          [100, 0],
        ],
        [
          [0, 1],
          [0, 2],
        ],
        { arrowEnd: true },
      ),
    );
    expect(g.arrows.count).toBe(1);
    expect(Array.from(g.arrows.link)).toEqual([1]);
    expect(g.offsets[1]).toBe(0);
    expect(g.starts).toHaveLength(0);
  });

  it('draws the route a layout gave a link: a polyline or cubic Bézier control points', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 100],
        ],
        [
          [0, 1],
          [0, 1],
          [0, 1],
        ],
        {
          routes: [
            { kind: 'polyline', points: Float64Array.of(0, 0, 0, 100, 100, 100) },
            { kind: 'spline', points: Float64Array.of(0, 0, 0, 50, 100, 50, 100, 100) },
            // Too short to be a route: the link is straight.
            { kind: 'polyline', points: Float64Array.of(0, 0) },
          ],
        },
      ),
    );
    expect(Array.from(g.x.subarray(0, 3))).toEqual([0, 0, 100]);
    expect(Array.from(g.y.subarray(0, 3))).toEqual([0, 100, 100]);
    const a = g.offsets[1]!;
    const b = g.offsets[2]!;
    // A segment for about every 8 px of the control polygon (200 px here), 12 at least.
    expect(b - a).toBe(26);
    expect([g.x[a], g.y[a]]).toEqual([0, 0]);
    expect([g.x[b - 1], g.y[b - 1]]).toEqual([100, 100]);
    // The S-curve is symmetric about its middle.
    expect(g.x[a + 12]! + g.x[a + 13]!).toBeCloseTo(100, 6);
    expect(g.y[a + 12]! + g.y[a + 13]!).toBeCloseTo(100, 6);
    expect(g.offsets[3]! - b).toBe(2);
  });

  it('carries a route that stops short of its node on to the outline, and the head with it', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [[0, 1]],
        {
          arrowEnd: true,
          routes: [{ kind: 'polyline', points: Float64Array.of(0, 0, 50, 0, 80, 0) }],
        },
      ),
    );
    // The node is a circle of radius 10 at x = 100: the tip is on it, not where the route ended.
    expect(g.arrows.x[0]).toBeCloseTo(90, 5);
    expect(g.arrows.angle[0]).toBeCloseTo(90, 3);
    // A route that ends on an outline depends on the scale: the outline is px.
    expect(g.depends).toBe('scale');
  });

  it('grows its buffers for many curved links', () => {
    const links = Array.from({ length: 50 }, () => [0, 1] as const);
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        links,
        { curve: new Float32Array(50).fill(0.1) },
      ),
    );
    expect(g.offsets[50]).toBe(50 * 17);
    expect(g.starts).toHaveLength(49);
    expect(Array.from(g.x).every(Number.isFinite)).toBe(true);
  });

  it('stays finite with scales of zero', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [1, 1],
        ],
        [[0, 1]],
        { scaleX: 0, scaleY: NaN },
      ),
    );
    expect(Array.from(g.x)).toEqual([0, 1]);
    expect(g.scaleX).toBe(1);
  });
});

describe('when geometry has to be rebuilt', () => {
  const straight = buildLinkGeometry(
    input(
      [
        [0, 0],
        [1, 0],
      ],
      [[0, 1]],
    ),
  );
  const curved = buildLinkGeometry(
    input(
      [
        [0, 0],
        [1, 0],
      ],
      [[0, 1]],
      { curve: Float32Array.of(0.2) },
    ),
  );
  const arrows = buildLinkGeometry(
    input(
      [
        [0, 0],
        [100, 0],
      ],
      [[0, 1]],
      { arrowEnd: true },
    ),
  );

  it('never for straight links', () => {
    expect(geometryStale(straight, 7, 0.1)).toBe(false);
  });

  it('for curves when the aspect of the scales changes', () => {
    expect(geometryStale(curved, 3, 3)).toBe(false);
    expect(geometryStale(curved, 3, 1)).toBe(true);
  });

  it('for arrowheads and loops when the scale changes', () => {
    expect(geometryStale(arrows, 1.001, 1.001)).toBe(false);
    expect(geometryStale(arrows, 2, 2)).toBe(true);
    expect(geometryStale(arrows, 1, 1.5)).toBe(true);
    expect(geometryStale(arrows, NaN, 1)).toBe(false);
  });
});

describe('distance to a link', () => {
  it('measures to the drawn path in px, through the transform', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [10, 0],
        ],
        [
          [0, 1],
          [1, 1],
        ],
        { loop: Int32Array.of(-1, 0) },
      ),
    );
    const t = { scaleX: 10, scaleY: 10, offsetX: 5, offsetY: 5 };
    const near = { x: 0, y: 0 };
    // The link runs from (5, 5) to (105, 5) on screen.
    expect(distanceToLink(g, 0, 55, 9, t, near)).toBeCloseTo(16, 6);
    expect(near).toEqual({ x: 5, y: 0 });
    // Beyond the end the distance is to the end point.
    expect(distanceToLink(g, 0, 108, 9, t)).toBeCloseTo(25, 6);
  });

  it('is infinite for a link that is not drawn', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [1, 0],
        ],
        [[0, 1]],
        { hidden: Uint8Array.of(1, 0) },
      ),
    );
    expect(distanceToLink(g, 0, 0, 0, IDENTITY)).toBe(Infinity);
  });
});

describe('routes and the nodes they end at', () => {
  const circle = { cx: 100, cy: 0, hw: 10, hh: 10, box: false };
  const path = (...points: number[]): Points => {
    const p = new Points();
    for (let i = 0; i < points.length; i += 2) p.push(points[i]!, points[i + 1]!);
    return p;
  };
  const last = (p: Points) => [p.data[2 * p.n - 2], p.data[2 * p.n - 1]];

  it('carries a path on along its last direction into the node', () => {
    const p = path(0, 0, 80, 0);
    extendTail(p, circle);
    expect(p.n).toBe(3);
    expect(last(p)).toEqual([100, 0]);
    // Off the line to the center, but still through the node: straight on, not to the center.
    const off = path(0, 5, 80, 5);
    extendTail(off, circle);
    expect(last(off)).toEqual([100, 5]);
  });

  it('goes to the center when straight on would miss the node', () => {
    const miss = path(0, 40, 80, 40);
    extendTail(miss, circle);
    expect(last(miss)).toEqual([100, 0]);
    // Pointing away from the node, and a path of one point.
    const away = path(120, 30, 120, 60);
    extendTail(away, circle);
    expect(last(away)).toEqual([100, 0]);
    const one = path(50, 0);
    extendTail(one, circle);
    expect(last(one)).toEqual([100, 0]);
  });

  it('leaves a path that ends inside the node, and an empty one', () => {
    const inside = path(0, 0, 95, 0);
    extendTail(inside, circle);
    expect(inside.n).toBe(2);
    const empty = new Points();
    extendTail(empty, circle);
    expect(empty.n).toBe(0);
  });

  it('closes the gap between a route and a box at any zoom, at both ends', () => {
    // A route from the right side of one box to the left side of another, laid out at scale 1.
    const boxes: Partial<LinkGeometryInput> = {
      box: true,
      halfWidth: new Float64Array(2).fill(20),
      halfHeight: new Float64Array(2).fill(10),
      routes: [{ kind: 'polyline', points: Float64Array.of(20, 0, 80, 0) }],
    };
    const nodes: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    // Zoomed in twice the boxes are half as wide in layout units: the route alone would stop
    // 10 units short of each. It is carried on to the centers.
    const zoomed = buildLinkGeometry(input(nodes, [[0, 1]], { ...boxes, scaleX: 2, scaleY: 2 }));
    expect(Array.from(zoomed.x)).toEqual([0, 20, 80, 100]);
    expect(zoomed.depends).toBe('scale');
    // With an arrowhead its tip is on the box as it is drawn: 10 units from the center.
    const headed = buildLinkGeometry(
      input(nodes, [[0, 1]], { ...boxes, arrowEnd: true, scaleX: 2, scaleY: 2 }),
    );
    expect(headed.arrows.x[0]).toBeCloseTo(90, 5);
    // A route between the centers is where it should be at any zoom.
    const centered = buildLinkGeometry(
      input(nodes, [[0, 1]], {
        ...boxes,
        routes: [{ kind: 'polyline', points: Float64Array.of(0, 0, 50, 20, 100, 0) }],
      }),
    );
    expect(centered.x).toHaveLength(3);
    expect(centered.depends).toBe('none');
  });

  it('leaves out the links it is told to skip', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
        ],
        [
          [0, 1],
          [1, 0],
        ],
        { skip: Uint8Array.of(1, 0), arrowEnd: true },
      ),
    );
    expect(g.offsets[1]! - g.offsets[0]!).toBe(0);
    expect(g.offsets[2]! - g.offsets[1]!).toBe(2);
    expect(Array.from(g.arrows.link)).toEqual([1]);
    expect(distanceToLink(g, 0, 50, 0, IDENTITY)).toBe(Infinity);
  });

  it('splits the links in two lines, each shaped like the whole', () => {
    const g = buildLinkGeometry(
      input(
        [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ],
      ),
    );
    const { rest, marked } = splitGeometry(g, Uint8Array.of(0, 1, 0, 1));
    expect(Array.from(rest.x)).toEqual([0, 100, 100, 0]);
    expect(Array.from(rest.y)).toEqual([0, 0, 50, 50]);
    expect(Array.from(rest.starts)).toEqual([2]);
    expect(Array.from(rest.offsets)).toEqual([0, 2, 2, 4, 4]);
    expect(Array.from(marked.x)).toEqual([100, 100, 0, 0]);
    expect(Array.from(marked.offsets)).toEqual([0, 0, 2, 2, 4]);
    expect(Array.from(marked.starts)).toEqual([2]);
    // Nothing marked: the second line is empty.
    const none = splitGeometry(g, new Uint8Array(4));
    expect(none.marked.x).toHaveLength(0);
    expect(Array.from(none.rest.x)).toEqual(Array.from(g.x));
  });

  it('samples a long curve more finely than a short one', () => {
    const route = (length: number) =>
      buildLinkGeometry(
        input(
          [
            [0, 0],
            [length, 0],
          ],
          [[0, 1]],
          {
            routes: [
              {
                kind: 'spline',
                points: Float64Array.of(
                  0,
                  0,
                  length / 3,
                  length,
                  (2 * length) / 3,
                  length,
                  length,
                  0,
                ),
              },
            ],
          },
        ),
      ).x.length;
    expect(route(20)).toBe(13);
    expect(route(120)).toBeGreaterThan(13);
    // No more than 48 segments, however long.
    expect(route(5000)).toBe(49);
  });

  it('draws the splines of a route with fewer segments when asked to', () => {
    const route = {
      kind: 'spline' as const,
      points: Float64Array.of(0, 0, 5, 10, 10, 10, 15, 0),
    };
    const built = (splineSegments?: number) =>
      buildLinkGeometry(
        input(
          [
            [0, 0],
            [15, 0],
          ],
          [[0, 1]],
          { routes: [route], splineSegments },
        ),
      ).x.length;
    // A short piece: the least number of segments.
    expect(built()).toBe(13);
    expect(built(6)).toBe(7);
    // Never more than the default least.
    expect(built(40)).toBe(13);
  });
});

describe('patchLinkGeometry', () => {
  /** A seeded graph with every kind of link: straight, curved, a loop, with arrowheads. */
  function scene(arrows: boolean) {
    let state = 77;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const n = 30;
    const points = Array.from({ length: n }, () => [next() * 600, next() * 400] as const);
    const links: [number, number][] = [];
    for (let k = 0; k < 90; k++) links.push([Math.floor(next() * n), Math.floor(next() * n)]);
    links.push([3, 3]);
    const curve = Float32Array.from(links, (_, k) => (k % 3 === 0 ? 0.2 : 0));
    const loop = Int32Array.from(links, (l) => (l[0] === l[1] ? 0 : -1));
    return input(points, links, { curve, loop, arrowEnd: arrows, arrowStart: arrows && true });
  }

  /** The links of `node`, and the loops of its neighbours. */
  const linksAt = (scene: LinkGeometryInput, node: number): number[] => {
    const near = new Set<number>();
    const out: number[] = [];
    for (let k = 0; k < scene.source.length; k++) {
      const a = scene.source[k]!;
      const b = scene.target[k]!;
      if (a !== node && b !== node) continue;
      out.push(k);
      near.add(a === node ? b : a);
    }
    for (let k = 0; k < scene.source.length; k++) {
      const a = scene.source[k]!;
      if (a === scene.target[k] && near.has(a) && !out.includes(k)) out.push(k);
    }
    return out.sort((p, q) => p - q);
  };

  const same = (a: ReturnType<typeof buildLinkGeometry>, b: typeof a): void => {
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(Array.from(a.y)).toEqual(Array.from(b.y));
    expect(Array.from(a.offsets)).toEqual(Array.from(b.offsets));
    expect(Array.from(a.starts)).toEqual(Array.from(b.starts));
    expect(a.arrows.count).toBe(b.arrows.count);
    expect(Array.from(a.arrows.x)).toEqual(Array.from(b.arrows.x));
    expect(Array.from(a.arrows.y)).toEqual(Array.from(b.arrows.y));
    expect(Array.from(a.arrows.angle)).toEqual(Array.from(b.arrows.angle));
    expect(Array.from(a.arrows.link)).toEqual(Array.from(b.arrows.link));
  };

  for (const arrows of [false, true]) {
    it(`is the geometry built again when one node moved${arrows ? ', arrowheads included' : ''}`, () => {
      const before = scene(arrows);
      const geometry = buildLinkGeometry(before);
      let patches = 0;
      for (let node = 0; node < 30; node++) {
        const x = Float64Array.from(before.x);
        const y = Float64Array.from(before.y);
        x[node] = x[node]! + 37;
        y[node] = y[node]! - 21;
        const after = { ...before, x, y };
        const rebuilt = buildLinkGeometry(after);
        // A fresh copy each time: the patch writes into the arrays it is given.
        const copy = buildLinkGeometry(before);
        const patched = patchLinkGeometry(copy, after, linksAt(before, node));
        if (!patched) {
          // Given up: a link got or lost its room between two nodes, which only arrowheads do.
          expect(arrows).toBe(true);
          expect(Array.from(rebuilt.offsets)).not.toEqual(Array.from(geometry.offsets));
          continue;
        }
        patches++;
        same(patched, rebuilt);
        // Another object over the same arrays: what is kept per geometry is made again.
        expect(patched).not.toBe(copy);
        expect(patched.x).toBe(copy.x);
      }
      expect(patches).toBeGreaterThan(arrows ? 15 : 29);
      expect(geometry.offsets).toHaveLength(92);
    });
  }

  it('gives up when a link gets or loses its room between two nodes, and writes nothing', () => {
    // Two nodes of radius 10, 100 apart, with an arrowhead: moved onto each other, no link.
    const before = input(
      [
        [0, 0],
        [100, 0],
        [0, 80],
      ],
      [
        [0, 1],
        [0, 2],
      ],
      { arrowEnd: true },
    );
    const geometry = buildLinkGeometry(before);
    const x = Float64Array.of(95, 100, 0);
    const kept = Array.from(geometry.x);
    expect(patchLinkGeometry(geometry, { ...before, x }, [0, 1])).toBeUndefined();
    expect(Array.from(geometry.x)).toEqual(kept);
  });

  it('leaves out what the input leaves out, and does nothing for no links', () => {
    const before = scene(false);
    const skip = new Uint8Array(before.source.length);
    skip[5] = 1;
    const geometry = buildLinkGeometry({ ...before, skip });
    const node = before.source[5]!;
    const x = Float64Array.from(before.x);
    x[node] = x[node]! + 10;
    const after = { ...before, x, skip };
    const patched = patchLinkGeometry(geometry, after, linksAt(before, node))!;
    same(patched, buildLinkGeometry(after));
    const none = patchLinkGeometry(patched, after, []);
    expect(none).not.toBe(patched);
    same(none!, patched);
  });

  it('refuses a geometry of another graph', () => {
    const geometry = buildLinkGeometry(scene(false));
    const other = input(
      [
        [0, 0],
        [1, 1],
      ],
      [[0, 1]],
    );
    expect(patchLinkGeometry(geometry, other, [0])).toBeUndefined();
  });
});
