import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hiveLayout, type HiveLayoutOptions, type HiveLayoutResult } from './hive.ts';
import type { GraphLayout, LayoutGraph } from './types.ts';

type Link = readonly [source: number, target: number];

/** A graph of `nodes` round nodes of radius 5 unless `extra` says otherwise. */
function graphOf(
  nodes: number,
  links: readonly Link[],
  extra: Partial<LayoutGraph> = {},
): LayoutGraph {
  return {
    nodes,
    source: Int32Array.from(links, (l) => l[0]),
    target: Int32Array.from(links, (l) => l[1]),
    weight: new Float64Array(links.length).fill(1),
    halfWidth: new Float64Array(nodes).fill(5),
    halfHeight: new Float64Array(nodes).fill(5),
    x: new Float64Array(nodes).fill(NaN),
    y: new Float64Array(nodes).fill(NaN),
    ...extra,
  };
}

/** Groups for `graphOf`: one axis per group. */
const grouped = (group: readonly number[], groups: number): Partial<LayoutGraph> => ({
  group: Int32Array.from(group),
  groups,
});

/** Distance of node `i` from the centre. */
const radiusOf = (r: HiveLayoutResult, i: number): number => Math.hypot(r.x[i]!, r.y[i]!);

/** The angle of a point in degrees, counter-clockwise from +x. */
const angleOf = (x: number, y: number): number => (Math.atan2(y, x) * 180) / Math.PI;

/** The difference between two angles in degrees, in (−180, 180]. */
const turn = (a: number, b: number): number => 180 - ((((180 - (a - b)) % 360) + 360) % 360);

/** A point at `radius` and `degrees`. */
const polar = (radius: number, degrees: number): [number, number] => [
  radius * Math.cos((degrees * Math.PI) / 180),
  radius * Math.sin((degrees * Math.PI) / 180),
];

/** The points of link `k`'s route as `[x, y]` pairs. */
function pointsOf(result: HiveLayoutResult, k: number): [number, number][] {
  const flat = result.routes[k]!.points;
  const out: [number, number][] = [];
  for (let j = 0; j < flat.length; j += 2) out.push([flat[j]!, flat[j + 1]!]);
  return out;
}

/** The point at `t` on a cubic of 4 points. */
function at(points: readonly (readonly [number, number])[], t: number): [number, number] {
  const u = 1 - t;
  const basis = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  let x = 0;
  let y = 0;
  basis.forEach((b, j) => {
    x += b * points[j]![0];
    y += b * points[j]![1];
  });
  return [x, y];
}

const expectPoint = (point: readonly [number, number], [x, y]: readonly [number, number]): void => {
  expect(point[0]).toBeCloseTo(x, 9);
  expect(point[1]).toBeCloseTo(y, 9);
};

/** Link ends at each node; a self-link counts twice. */
function degreesOf(graph: LayoutGraph): number[] {
  const out = new Array<number>(graph.nodes).fill(0);
  for (let k = 0; k < graph.source.length; k++) {
    out[graph.source[k]!]!++;
    out[graph.target[k]!]!++;
  }
  return out;
}

/** A random small graph with its node sizes: `[nodes, links, halfWidth, halfHeight]`. */
const graphs = fc
  .integer({ min: 0, max: 16 })
  .chain((n) =>
    fc.tuple(
      fc.constant(n),
      n === 0
        ? fc.constant<[number, number][]>([])
        : fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 30 }),
      fc.array(fc.integer({ min: 0, max: 12 }), { minLength: n, maxLength: n }),
      fc.array(fc.integer({ min: 0, max: 12 }), { minLength: n, maxLength: n }),
    ),
  );

describe('hive layout: axes', () => {
  it('makes one axis per group, counter-clockwise from the top, and is a GraphLayout', () => {
    const layout: GraphLayout<HiveLayoutOptions> = hiveLayout;
    const graph = graphOf(6, [], grouped([0, 1, 2, 2, 1, 0], 3));
    const r = hiveLayout(graph);
    expect(layout(graph, {}).x).toEqual(r.x);
    expect([...r.axis]).toEqual([0, 1, 2, 2, 1, 0]);
    expect([...r.axisAngle]).toEqual([90, 210, 330]);
    // The number of axes is the number of groups, whatever `axes` says and with no node in one.
    const sparse = hiveLayout(graphOf(2, [], grouped([3, 0], 4)), { axes: 7 });
    expect([...sparse.axisAngle]).toEqual([90, 180, 270, 360]);
    expect([...sparse.axis]).toEqual([3, 0]);
  });

  it('adds an axis at the end for nodes without a group, only when there are some', () => {
    const r = hiveLayout(graphOf(5, [], grouped([0, -1, 2, 1, 9], 3)));
    expect([...r.axisAngle]).toEqual([90, 180, 270, 360]);
    // −1 is "no group"; a group beyond `groups` is none either.
    expect([...r.axis]).toEqual([0, 3, 2, 1, 3]);
  });

  it('splits by degree into options.axes equal parts, three by default', () => {
    // A star around 0 with a tail: degrees 4, 1, 1, 1, 2, 1.
    const links: Link[] = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [4, 5],
    ];
    const graph = graphOf(6, links);
    const r = hiveLayout(graph);
    expect([...r.axisAngle]).toEqual([90, 210, 330]);
    // By degree, ties by index: 1, 2 | 3, 5 | 4, 0.
    expect([...r.axis]).toEqual([2, 0, 0, 1, 2, 1]);
    const two = hiveLayout(graph, { axes: 2 });
    expect([...two.axisAngle]).toEqual([90, 270]);
    expect([...two.axis]).toEqual([1, 0, 0, 0, 1, 1]);
    expect([...hiveLayout(graph, { axes: 5.9 }).axisAngle]).toEqual([90, 162, 234, 306, 378]);
    expect(hiveLayout(graph, { axes: 1 }).axisAngle).toHaveLength(1);
    // Fewer than one axis is one; not a number is the default.
    for (const axes of [0, -2]) expect(hiveLayout(graph, { axes }).axisAngle).toHaveLength(1);
    expect(hiveLayout(graph, { axes: NaN }).axisAngle).toHaveLength(3);
    // More axes than nodes: some stay empty.
    const wide = hiveLayout(graphOf(2, [[0, 1]]), { axes: 6 });
    expect(wide.axisAngle).toHaveLength(6);
    expect([...wide.axis]).toEqual([0, 3]);
    // An absurd count is capped, not allocated.
    expect(hiveLayout(graph, { axes: 1e12 }).axisAngle).toHaveLength(360);
    // Groups that are declared but empty (`groups: 0`) are no groups.
    expect([...hiveLayout(graphOf(6, links, grouped([0, 0, 0, 0, 0, 0], 0))).axis]).toEqual([
      ...r.axis,
    ]);
  });

  it('splits into sources, nodes in between and sinks with assign: direction', () => {
    // 0 → 1 → 2, 3 alone, 4 with a self-link only, 5 → 2.
    const graph = graphOf(6, [
      [0, 1],
      [1, 2],
      [4, 4],
      [5, 2],
    ]);
    const r = hiveLayout(graph, { assign: 'direction', axes: 5 });
    expect([...r.axisAngle]).toEqual([90, 210, 330]);
    expect([...r.axis]).toEqual([0, 1, 2, 1, 1, 0]);
    // Groups come first.
    const byGroup = hiveLayout(graphOf(2, [[0, 1]], grouped([1, 1], 2)), { assign: 'direction' });
    expect([...byGroup.axis]).toEqual([1, 1]);
    expect(byGroup.axisAngle).toHaveLength(2);
  });

  it('turns the axes with startAngle', () => {
    const graph = graphOf(4, [], grouped([0, 1, 2, 3], 4));
    const r = hiveLayout(graph, { startAngle: 0 });
    expect([...r.axisAngle]).toEqual([0, 90, 180, 270]);
    // Quarter turns are exact: no 1e-14 beside the axis.
    expect([...r.x]).toEqual([170, 0, -170, 0]);
    expect([...r.y]).toEqual([0, 170, 0, -170]);
    const up = hiveLayout(graph, { startAngle: -270 });
    expect([...up.x]).toEqual([0, -170, 0, 170]);
    expect([...hiveLayout(graph, { startAngle: NaN }).axisAngle]).toEqual([90, 180, 270, 360]);
    const slanted = hiveLayout(graph, { startAngle: 30 });
    expectPoint([slanted.x[0]!, slanted.y[0]!], polar(170, 30));
  });
});

describe('hive layout: nodes', () => {
  it('spreads the nodes of an axis by degree rank between the two radii', () => {
    // Axis 0: nodes 0 … 3 with degrees 1, 3, 0, 2. Axis 1: node 4 alone. Axis 2: nodes 5 and 6.
    const graph = graphOf(
      7,
      [
        [1, 4],
        [1, 5],
        [1, 6],
        [3, 4],
        [3, 5],
        [0, 6],
      ],
      grouped([0, 0, 0, 0, 1, 2, 2], 3),
    );
    const r = hiveLayout(graph);
    const third = 260 / 3;
    expect([...r.x].slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(r.y[2]).toBe(40);
    expect(r.y[0]).toBeCloseTo(40 + third, 9);
    expect(r.y[3]).toBeCloseTo(40 + 2 * third, 9);
    expect(r.y[1]).toBe(300);
    // Alone on its axis: halfway.
    expectPoint([r.x[4]!, r.y[4]!], polar(170, 210));
    // Equal degrees: the lower index is nearer the centre.
    expectPoint([r.x[5]!, r.y[5]!], polar(40, 330));
    expectPoint([r.x[6]!, r.y[6]!], polar(300, 330));
    const tight = hiveLayout(graph, { innerRadius: 10, outerRadius: 100 });
    expect([tight.y[2], tight.y[0], tight.y[3], tight.y[1]]).toEqual([10, 40, 70, 100]);
  });

  it('keeps equal gaps between the outlines of nodes of different sizes', () => {
    // One axis pointing up; heights 10, 80, 20, 10 along it.
    const graph = graphOf(4, [], {
      ...grouped([0, 0, 0, 0], 1),
      halfHeight: Float64Array.of(5, 40, 10, 5),
    });
    const r = hiveLayout(graph, { innerRadius: 0, outerRadius: 200 });
    // Centre to centre the outlines need 45 + 50 + 15 = 110: 30 left for each of the three gaps.
    expect([...r.y]).toEqual([0, 75, 155, 200]);
    for (let i = 1; i < 4; i++) {
      const gap = r.y[i]! - r.y[i - 1]! - graph.halfHeight[i]! - graph.halfHeight[i - 1]!;
      expect(gap).toBeCloseTo(30, 9);
    }
    // On a level axis it is the widths that count.
    const level = hiveLayout(graph, { innerRadius: 0, outerRadius: 200, startAngle: 180 });
    [0, -200 / 3, -400 / 3, -200].forEach((x, i) => expect(level.x[i]).toBeCloseTo(x, 9));
    expect([...level.y]).toEqual([0, 0, 0, 0]);
  });

  it('overlaps nodes rather than leave the axis when they do not fit', () => {
    const n = 100;
    const graph = graphOf(n, [], grouped(new Array<number>(n).fill(0), 1));
    const r = hiveLayout(graph);
    // 100 nodes of 10 on 260: equal steps of 260 / 99.
    for (let i = 0; i < n; i++) expect(r.y[i]).toBeCloseTo(40 + (i * 260) / 99, 9);
    expect(r.y[0]).toBe(40);
    expect(r.y[n - 1]).toBe(300);
  });

  it('places by value on one scale for all axes with position: value', () => {
    const graph = graphOf(6, [[0, 1]], {
      ...grouped([0, 0, 1, 1, 1, 0], 2),
      value: Float64Array.of(10, 30, 20, NaN, 50, -Infinity),
    });
    const r = hiveLayout(graph, { position: 'value', innerRadius: 100, outerRadius: 300 });
    // 10 … 50 on 100 … 300; what is not a finite number counts as the smallest.
    expect([...r.axisAngle]).toEqual([90, 270]);
    expect([...r.y]).toEqual([100, 200, -150, -100, -300, 100]);
    expect([...r.x]).toEqual([0, 0, 0, 0, 0, 0]);
    // All values equal, or none usable: halfway.
    const flat = hiveLayout(graphOf(3, [], { value: Float64Array.of(7, 7, 7) }), {
      position: 'value',
    });
    for (let i = 0; i < 3; i++) expect(radiusOf(flat, i)).toBeCloseTo(170, 9);
    const none = hiveLayout(graphOf(2, [], { value: Float64Array.of(NaN, NaN) }), {
      position: 'value',
    });
    for (let i = 0; i < 2; i++) expect(radiusOf(none, i)).toBeCloseTo(170, 9);
    // A range as wide as the doubles is still a scale.
    const huge = hiveLayout(
      graphOf(3, [], { ...grouped([0, 0, 0], 1), value: Float64Array.of(-1.7e308, 1.7e308, 0) }),
      { position: 'value' },
    );
    expect([...huge.y]).toEqual([40, 300, 170]);
    // No values at all: by degree.
    const graphNoValue = graphOf(3, [[0, 1]], grouped([0, 0, 0], 1));
    expect(hiveLayout(graphNoValue, { position: 'value' })).toEqual(hiveLayout(graphNoValue));
  });

  it('keeps the radii in order and usable whatever the options', () => {
    const graph = graphOf(3, [], grouped([0, 0, 0], 1));
    // The outer radius is at least the inner one.
    expect([...hiveLayout(graph, { innerRadius: 80, outerRadius: 20 }).y]).toEqual([80, 80, 80]);
    expect([...hiveLayout(graph, { innerRadius: -5, outerRadius: NaN }).y]).toEqual([0, 150, 300]);
    expect([...hiveLayout(graph, { innerRadius: NaN }).y]).toEqual([40, 170, 300]);
  });

  it('puts every node on its axis, within the radii, further out with more links (property)', () => {
    fc.assert(
      fc.property(
        graphs,
        fc.constantFrom(1, 2, 3, 4, 5, 7),
        fc.constantFrom('degree', 'direction'),
        fc.constantFrom(90, 0, 17, -123.5),
        fc.boolean(),
        ([n, links, halfWidth, halfHeight], axes, assign, startAngle, byGroup) => {
          const graph = graphOf(n, links, {
            halfWidth: Float64Array.from(halfWidth),
            halfHeight: Float64Array.from(halfHeight),
            ...(byGroup
              ? grouped(
                  Array.from({ length: n }, (_, i) => (i % 4) - 1),
                  3,
                )
              : {}),
          });
          const r = hiveLayout(graph, { axes, assign, startAngle });
          const count = byGroup ? (n > 0 ? 4 : 3) : assign === 'direction' ? 3 : axes;
          expect(r.axisAngle).toHaveLength(count);
          r.axisAngle.forEach((angle, a) =>
            expect(angle).toBeCloseTo(startAngle + (a * 360) / count, 9),
          );
          const degree = degreesOf(graph);
          for (let i = 0; i < n; i++) {
            const a = r.axis[i]!;
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThan(count);
            expect(turn(angleOf(r.x[i]!, r.y[i]!), r.axisAngle[a]!)).toBeCloseTo(0, 6);
            expect(radiusOf(r, i)).toBeGreaterThanOrEqual(40 - 1e-9);
            expect(radiusOf(r, i)).toBeLessThanOrEqual(300 + 1e-9);
          }
          // Along an axis: by degree, then by index.
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              if (r.axis[i] !== r.axis[j]) continue;
              if (degree[i]! < degree[j]! || (degree[i] === degree[j] && i < j)) {
                expect(radiusOf(r, i)).toBeLessThanOrEqual(radiusOf(r, j) + 1e-9);
              }
            }
          }
          // By degree, a later axis never has a less connected node than an earlier one.
          if (!byGroup && assign === 'degree') {
            for (let i = 0; i < n; i++) {
              for (let j = 0; j < n; j++) {
                if (r.axis[i]! < r.axis[j]!) expect(degree[i]).toBeLessThanOrEqual(degree[j]!);
              }
            }
            const sizes = new Array<number>(count).fill(0);
            for (const a of r.axis) sizes[a]!++;
            for (const size of sizes) {
              expect(size).toBeGreaterThanOrEqual(Math.floor(n / count));
              expect(size).toBeLessThanOrEqual(Math.ceil(n / count));
            }
          }
        },
      ),
    );
  });

  it('does not overlap the nodes of an axis where there is room (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 12 })), {
          minLength: 2,
          maxLength: 8,
        }),
        fc.constantFrom(90, 0, 30, 45, 200),
        (sizes, startAngle) => {
          // One axis, at most 8 nodes of at most 24 × 24: they fit in 260 at any angle.
          const n = sizes.length;
          const graph = graphOf(n, [], {
            ...grouped(new Array<number>(n).fill(0), 1),
            halfWidth: Float64Array.from(sizes, (s) => s[0]),
            halfHeight: Float64Array.from(sizes, (s) => s[1]),
          });
          const r = hiveLayout(graph, { startAngle });
          for (let i = 1; i < n; i++) {
            // Two boxes are apart when they are apart along x or along y.
            const dx = Math.abs(r.x[i]! - r.x[i - 1]!) - sizes[i]![0] - sizes[i - 1]![0];
            const dy = Math.abs(r.y[i]! - r.y[i - 1]!) - sizes[i]![1] - sizes[i - 1]![1];
            expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(-1e-9);
            expect(radiusOf(r, i)).toBeGreaterThanOrEqual(radiusOf(r, i - 1));
          }
          expect(radiusOf(r, 0)).toBeCloseTo(40, 9);
          expect(radiusOf(r, n - 1)).toBeCloseTo(300, 9);
        },
      ),
    );
  });
});

describe('hive layout: links', () => {
  // Axis 0 (90°): node 3 at 40 and node 0 at 300 (more links). Axes 1 (210°) and 2 (330°): nodes
  // 1 and 2, alone, at 170.
  const GRAPH = graphOf(
    4,
    [
      [0, 1],
      [1, 0],
      [0, 2],
      [0, 3],
      [2, 2],
      [0, 1],
    ],
    grouped([0, 1, 2, 0], 3),
  );

  it('routes a link between two axes as one curve around the centre, the short way', () => {
    const r = hiveLayout(GRAPH);
    expect(r.routes).toHaveLength(6);
    const ccw = pointsOf(r, 0);
    expect(r.routes[0]!.kind).toBe('spline');
    expect(ccw).toHaveLength(4);
    // From the source to the target, exactly.
    expect(ccw[0]).toEqual([r.x[0], r.y[0]]);
    expect(ccw[3]).toEqual([r.x[1], r.y[1]]);
    expect(ccw[0]).toEqual([0, 300]);
    expectPoint(ccw[3]!, polar(170, 210));
    // 90° → 210°: control points a third and two thirds of the way, at the ends' radii.
    expectPoint(ccw[1]!, polar(300, 130));
    expectPoint(ccw[2]!, polar(170, 170));
    // 90° → 330° is shorter clockwise, through 50° and 10°.
    const cw = pointsOf(r, 2);
    expect(cw[0]).toEqual([0, 300]);
    expectPoint(cw[1]!, polar(300, 50));
    expectPoint(cw[2]!, polar(170, 10));
    expectPoint(cw[3]!, polar(170, 330));
    // The curve stays between its two axes and away from the centre.
    for (let t = 0; t <= 1; t += 0.05) {
      const [x, y] = at(ccw, t);
      const angle = angleOf(x, y);
      expect(turn(angle, 90)).toBeGreaterThanOrEqual(-1e-9);
      expect(turn(210, angle)).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.hypot(x, y)).toBeGreaterThan(100);
    }
  });

  it('shares one curve between parallel links and with the reverse link', () => {
    const r = hiveLayout(GRAPH);
    expect(r.routes[5]).toEqual(r.routes[0]);
    expect(r.routes[5]!.points).not.toBe(r.routes[0]!.points);
    const back = pointsOf(r, 1);
    pointsOf(r, 0)
      .reverse()
      .forEach((point, j) => expectPoint(back[j]!, point));
  });

  it('leaves out links within one axis and self-links, and says so', () => {
    const r = hiveLayout(GRAPH);
    expect([...r.omitted]).toEqual([0, 0, 0, 1, 1, 0]);
    expect(r.routes.map((route) => route !== undefined)).toEqual([
      true,
      true,
      true,
      false,
      false,
      true,
    ]);
    // One axis: nothing to draw between axes.
    const one = hiveLayout(
      graphOf(3, [
        [0, 1],
        [1, 2],
      ]),
      { axes: 1 },
    );
    expect([...one.omitted]).toEqual([1, 1]);
    expect(one.routes).toEqual([undefined, undefined]);
    // A link whose end is not a node is left out too, and changes nothing.
    const broken = hiveLayout(
      graphOf(
        2,
        [
          [0, 5],
          [-1, 1],
          [0, 1],
        ],
        grouped([0, 1], 2),
      ),
    );
    expect([...broken.omitted]).toEqual([1, 1, 0]);
    expect(broken).toEqual({
      ...hiveLayout(graphOf(2, [[0, 1]], grouped([0, 1], 2))),
      routes: [undefined, undefined, broken.routes[2]],
      omitted: Uint8Array.of(1, 1, 0),
    });
  });

  it('goes counter-clockwise from the lower axis between two opposite axes', () => {
    // Four axes at 90°, 180°, 270°, 0°; a node on each at 170.
    const graph = graphOf(
      4,
      [
        [0, 2],
        [2, 0],
        [3, 1],
        [1, 3],
        [0, 3],
      ],
      grouped([0, 1, 2, 3], 4),
    );
    const r = hiveLayout(graph);
    // 90° → 270° through 150° and 210°, whichever way the link points.
    const down = pointsOf(r, 0);
    expectPoint(down[1]!, polar(170, 150));
    expectPoint(down[2]!, polar(170, 210));
    const up = pointsOf(r, 1);
    expectPoint(up[1]!, polar(170, 210));
    expectPoint(up[2]!, polar(170, 150));
    // 180° → 0° (axes 1 and 3) through 240° and 300°.
    const across = pointsOf(r, 3);
    expectPoint(across[1]!, polar(170, 240));
    expectPoint(across[2]!, polar(170, 300));
    const back = pointsOf(r, 2);
    expectPoint(back[1]!, polar(170, 300));
    expectPoint(back[2]!, polar(170, 240));
    // 90° → 0° is a quarter turn clockwise, not three quarters the other way.
    const short = pointsOf(r, 4);
    expectPoint(short[1]!, polar(170, 60));
    expectPoint(short[2]!, polar(170, 30));
    // Two axes are always opposite.
    const two = hiveLayout(graphOf(2, [[1, 0]], grouped([0, 1], 2)));
    expectPoint(pointsOf(two, 0)[1]!, polar(170, 210));
    expectPoint(pointsOf(two, 0)[2]!, polar(170, 150));
  });

  it('routes exactly the links between two axes, end to end (property)', () => {
    fc.assert(
      fc.property(graphs, fc.constantFrom(1, 2, 3, 4, 6), ([n, links], axes) => {
        const graph = graphOf(n, links);
        const r = hiveLayout(graph, { axes });
        expect(r.routes).toHaveLength(links.length);
        expect(r.omitted).toHaveLength(links.length);
        links.forEach(([s, t], k) => {
          const same = r.axis[s] === r.axis[t];
          expect(r.omitted[k]).toBe(same ? 1 : 0);
          if (same) {
            expect(r.routes[k]).toBeUndefined();
            return;
          }
          const points = pointsOf(r, k);
          expect(points).toHaveLength(4);
          expect(points[0]).toEqual([r.x[s], r.y[s]]);
          expect(points[3]).toEqual([r.x[t], r.y[t]]);
          // The control points keep the radii of the ends and sit between the two axes.
          expect(Math.hypot(...points[1]!)).toBeCloseTo(radiusOf(r, s), 9);
          expect(Math.hypot(...points[2]!)).toBeCloseTo(radiusOf(r, t), 9);
          const from = r.axisAngle[r.axis[s]!]!;
          const sweep = turn(r.axisAngle[r.axis[t]!]!, from);
          const first = turn(angleOf(...points[1]!), from);
          const second = turn(angleOf(...points[2]!), from);
          expect(Math.abs(first)).toBeCloseTo(Math.abs(sweep) / 3, 6);
          expect(Math.abs(second)).toBeCloseTo((2 * Math.abs(sweep)) / 3, 6);
          if (Math.abs(sweep) < 180 - 1e-6) expect(Math.sign(first)).toBe(Math.sign(sweep));
          for (const v of r.routes[k]!.points) expect(Number.isFinite(v)).toBe(true);
        });
      }),
    );
  });
});

describe('hive layout: edge cases', () => {
  it('lays out no nodes and one node', () => {
    const empty = hiveLayout(graphOf(0, []));
    expect(empty.x).toEqual(new Float64Array(0));
    expect(empty.y).toEqual(new Float64Array(0));
    expect(empty.axis).toEqual(new Int32Array(0));
    expect([...empty.axisAngle]).toEqual([90, 210, 330]);
    expect(empty.routes).toEqual([]);
    expect(empty.omitted).toEqual(new Uint8Array(0));
    expect(hiveLayout(graphOf(0, [], grouped([], 2))).axisAngle).toHaveLength(2);
    for (const options of [{}, { assign: 'direction' }, { position: 'value' }] as const) {
      const one = hiveLayout(graphOf(1, [[0, 0]], { value: Float64Array.of(3) }), options);
      // By degree a lone node is on axis 0; by direction a node with only a self-link is "between".
      const axis = options.assign === 'direction' ? 1 : 0;
      expect([...one.axis]).toEqual([axis]);
      expectPoint([one.x[0]!, one.y[0]!], polar(170, 90 + axis * 120));
      expect(one.routes).toEqual([undefined]);
      expect([...one.omitted]).toEqual([1]);
    }
  });

  it('lays out a graph without links', () => {
    const r = hiveLayout(graphOf(7, []));
    // All degrees equal: index order, cut in three.
    expect([...r.axis]).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(r.routes).toEqual([]);
    expect([...r.x, ...r.y].every((v) => Number.isFinite(v))).toBe(true);
    expect([r.y[0], r.y[1], r.y[2]]).toEqual([40, 170, 300]);
    // Without links every node is "in between".
    expect([...hiveLayout(graphOf(3, []), { assign: 'direction' }).axis]).toEqual([1, 1, 1]);
  });

  it('gives the same finite arrays for the same input (property)', () => {
    fc.assert(
      fc.property(
        graphs,
        fc.constantFrom(1, 2, 3, 5),
        fc.constantFrom('degree', 'direction'),
        fc.constantFrom('degree', 'value'),
        ([n, links, halfWidth, halfHeight], axes, assign, position) => {
          const make = (): HiveLayoutResult =>
            hiveLayout(
              graphOf(n, links, {
                halfWidth: Float64Array.from(halfWidth),
                halfHeight: Float64Array.from(halfHeight),
                value: Float64Array.from(halfWidth, (v, i) => (i % 5 === 4 ? NaN : v * 3 - 7)),
              }),
              { axes, assign, position, startAngle: 33 },
            );
          const r = make();
          expect(r).toEqual(make());
          for (const v of [...r.x, ...r.y, ...r.axisAngle]) expect(Number.isFinite(v)).toBe(true);
          for (const route of r.routes) {
            for (const v of route?.points ?? []) expect(Number.isFinite(v)).toBe(true);
          }
        },
      ),
    );
  });

  it('lays out a hundred thousand nodes', () => {
    const n = 100_000;
    const links: Link[] = [];
    for (let i = 0; i < n; i++) links.push([i, (i * 31 + 17) % n], [i, (i * 7919 + 3) % n]);
    const r = hiveLayout(graphOf(n, links));
    expect(r.x.every((v) => Number.isFinite(v))).toBe(true);
    expect(r.y.every((v) => Number.isFinite(v))).toBe(true);
    expect(r.routes).toHaveLength(links.length);
    let drawn = 0;
    r.routes.forEach((route, k) => {
      if (!route) return;
      drawn++;
      expect(r.omitted[k]).toBe(0);
    });
    expect(drawn + r.omitted.reduce((sum, v) => sum + v, 0)).toBe(links.length);
    expect(drawn).toBeGreaterThan(0);
  });
});
