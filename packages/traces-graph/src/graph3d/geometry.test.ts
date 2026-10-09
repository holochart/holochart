import { describe, expect, it } from 'vitest';
import type { GraphModel } from '../graph/model.ts';
import type { Graph3dCalc } from './calc.ts';
import {
  ARROW_ASPECT,
  CURVE_SEGMENTS,
  drawnLinkMiddle,
  drawnLinks3d,
  keepLinkPaths,
  linkLines,
  linkMesh,
  linkPaths,
  LOOP_SEGMENTS,
  pathMiddle,
  planeOutlines,
  SEGMENTS,
  type LinkMesh,
  type LinkMeshInput,
  type LinkPathInput,
  type LinkPaths,
} from './geometry.ts';

/** A calc with what the geometry reads: positions, hidden nodes and the links. */
function calcOf(
  positions: readonly (readonly [number, number, number])[],
  links: readonly (readonly [number, number])[],
  hidden: readonly number[] = [],
): Graph3dCalc {
  const n = positions.length;
  const flags = new Uint8Array(n);
  for (const i of hidden) flags[i] = 1;
  return {
    model: {
      nodes: n,
      links: links.length,
      source: Int32Array.from(links, (l) => l[0]),
      target: Int32Array.from(links, (l) => l[1]),
    } as unknown as GraphModel,
    length: n,
    x: Float64Array.from(positions, (p) => p[0]),
    y: Float64Array.from(positions, (p) => p[1]),
    z: Float64Array.from(positions, (p) => p[2]),
    hidden: flags,
  } as unknown as Graph3dCalc;
}

/** Every triangle faces the way its vertices' normals point. */
function outwardFacing(mesh: LinkMesh): boolean {
  const p = (v: number, c: number): number => mesh.positions[3 * v + c]!;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    const u = [0, 1, 2].map((k) => p(b, k) - p(a, k));
    const v = [0, 1, 2].map((k) => p(c, k) - p(a, k));
    const face = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    let along = 0;
    for (const vertex of [a, b, c]) {
      for (let k = 0; k < 3; k++) along += face[k]! * mesh.normals[3 * vertex + k]!;
    }
    if (!(along > 0)) return false;
  }
  return true;
}

/** Three nodes, a link along x and one along z. */
const NODES = {
  x: [0, 10, 10],
  y: [0, 0, 0],
  z: [0, 0, 8],
  radius: [1, 2, 1],
  source: Int32Array.of(0, 1),
  target: Int32Array.of(1, 2),
};

/** The mesh input of `NODES` with the paths of the `drawn` links. */
function meshInput(
  drawn: readonly number[] = [0, 1],
  nodes: Partial<LinkPathInput> = {},
): LinkMeshInput {
  const all = { ...NODES, ...nodes };
  return {
    ...all,
    paths: linkPaths({ ...all, drawn: Int32Array.from(drawn) }),
    color: [0.2, 0.4, 0.6, 1],
  };
}

const BASE = meshInput();

/** Point `i` of path `j`. */
function pointOf(paths: LinkPaths, j: number, i: number): [number, number, number] {
  const at = 3 * (paths.offsets[j]! + i);
  return [paths.points[at]!, paths.points[at + 1]!, paths.points[at + 2]!];
}

describe('graph3d links', () => {
  it('draws the links between drawn nodes, a link from a node to itself among them', () => {
    const calc = calcOf(
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 0],
      ],
      [2],
    );
    expect(Array.from(drawnLinks3d(calc))).toEqual([0, 1]);
    expect(Array.from(drawnLinks3d({ ...calc, hidden: new Uint8Array(3) }))).toEqual([0, 1, 2, 3]);
  });

  it('a link without a curvature is the segment between its nodes', () => {
    const paths = linkPaths({ ...NODES, drawn: Int32Array.of(1) });
    expect(Array.from(paths.offsets)).toEqual([0, 2]);
    expect(Array.from(paths.points)).toEqual([10, 0, 0, 10, 0, 8]);
    expect(pathMiddle(paths, 0)).toEqual([10, 0, 4]);
    // A curvature of 0 (a single link's fan) is straight too.
    const flat = linkPaths({ ...NODES, drawn: Int32Array.of(0, 1), curve: [0, NaN] });
    expect(Array.from(flat.offsets)).toEqual([0, 2, 4]);
  });

  it('a curved link bows to the left of its direction seen from above, by a share of its length', () => {
    const paths = linkPaths({ ...NODES, drawn: Int32Array.of(0), curve: [0.2, 0] });
    expect(paths.offsets[1]).toBe(CURVE_SEGMENTS + 1);
    expect(pointOf(paths, 0, 0)).toEqual([0, 0, 0]);
    expect(pointOf(paths, 0, CURVE_SEGMENTS)).toEqual([10, 0, 0]);
    // Along +x, left is +y: the apex is 0.2 × 10 from the chord, in the plane z = 0.
    const apex = pathMiddle(paths, 0);
    expect(apex[0]).toBeCloseTo(5, 9);
    expect(apex[1]).toBeCloseTo(2, 9);
    expect(apex[2]).toBeCloseTo(0, 9);
  });

  it('two opposite links with the same curvature bow apart, and so do the two of a fan', () => {
    const nodes = { ...NODES, source: Int32Array.of(0, 1, 1), target: Int32Array.of(1, 0, 2) };
    const both = linkPaths({ ...nodes, drawn: Int32Array.of(0, 1), curve: [0.1, 0.1, 0] });
    expect(pathMiddle(both, 0)[1]).toBeCloseTo(1, 9);
    expect(pathMiddle(both, 1)[1]).toBeCloseTo(-1, 9);
    // A link along z bows along y, and turns around with its direction.
    const up = linkPaths({ ...nodes, drawn: Int32Array.of(2), curve: [0, 0, 0.25] });
    expect(pathMiddle(up, 0)).toEqual([10, -2, 4]);
    const down = linkPaths({
      ...nodes,
      source: Int32Array.of(0, 1, 2),
      target: Int32Array.of(1, 0, 1),
      drawn: Int32Array.of(2),
      curve: [0, 0, 0.25],
    });
    expect(pathMiddle(down, 0)).toEqual([10, 2, 4]);
  });

  it('a self-link is a ring through its node, away from the neighbours, larger for every further one', () => {
    const nodes = {
      ...NODES,
      source: Int32Array.of(0, 1, 1),
      target: Int32Array.of(1, 1, 1),
      loop: Int32Array.of(-1, 0, 1),
      loopReach: 3,
      loopStep: 2,
    };
    const paths = linkPaths({ ...nodes, drawn: Int32Array.of(0, 1, 2) });
    expect(paths.offsets[2]! - paths.offsets[1]!).toBe(LOOP_SEGMENTS + 1);
    // Node 1 (radius 2) at (10, 0, 0) has its one neighbour at −x: the ring points to +x and
    // reaches its radius and the reach (3, more than the radius would give) beyond the center.
    expect(pointOf(paths, 1, 0)).toEqual([10, 0, 0]);
    const far = pathMiddle(paths, 1);
    expect(far[0]).toBeCloseTo(15, 9);
    expect(far[1]).toBeCloseTo(0, 9);
    expect(far[2]).toBeCloseTo(0, 9);
    const last = pointOf(paths, 1, LOOP_SEGMENTS);
    expect(Math.hypot(last[0] - 10, last[1], last[2])).toBeLessThan(1e-9);
    // Every point is half the reach from the ring's center.
    for (let i = 0; i <= LOOP_SEGMENTS; i++) {
      const p = pointOf(paths, 1, i);
      expect(Math.hypot(p[0] - 12.5, p[1], p[2])).toBeCloseTo(2.5, 9);
    }
    expect(pathMiddle(paths, 2)[0]).toBeCloseTo(17, 9);
    // Alone, a node's ring points up the z axis.
    const alone = linkPaths({
      x: [0],
      y: [0],
      z: [0],
      radius: [4],
      source: Int32Array.of(0),
      target: Int32Array.of(0),
      drawn: Int32Array.of(0),
      loop: [0],
      loopReach: 1,
    });
    const top = pathMiddle(alone, 0);
    expect(Math.hypot(top[0], top[1])).toBeLessThan(1e-9);
    expect(top[2]).toBeCloseTo(8, 9);
  });

  it('lines are one polyline with a gap after every link, each vertex naming its link', () => {
    const paths = linkPaths({
      x: [0, 3, 6],
      y: [1, 4, 7],
      z: [2, 5, 8],
      radius: [0, 0, 0],
      source: Int32Array.of(0, 2),
      target: Int32Array.of(1, 0),
      drawn: Int32Array.of(1),
    });
    const lines = linkLines(paths);
    expect(Array.from(lines.x)).toEqual([6, 0, NaN]);
    expect(Array.from(lines.y)).toEqual([7, 1, NaN]);
    expect(Array.from(lines.z)).toEqual([8, 2, NaN]);
    expect(Array.from(lines.link)).toEqual([1, 1, 1]);
    // Paths are in scene units: the lines are in the linear coordinates of the scene's transform.
    const linear = linkLines(paths, {
      scaleX: 2,
      scaleY: 1,
      scaleZ: 4,
      offsetX: 0,
      offsetY: 1,
      offsetZ: 0,
    });
    expect(Array.from(linear.x)).toEqual([3, 0, NaN]);
    expect(Array.from(linear.y)).toEqual([6, 0, NaN]);
    expect(Array.from(linear.z)).toEqual([2, 0.5, NaN]);
    const curved = linkPaths({ ...NODES, drawn: Int32Array.of(0, 1), curve: [0.3, 0] });
    expect(linkLines(curved).x.length).toBe(CURVE_SEGMENTS + 1 + 1 + 2 + 1);
  });

  it('the middle of a link as it was drawn is where its hover label points', () => {
    const calc = calcOf(
      [
        [0, 0, 0],
        [5, 0, 0],
      ],
      [
        [0, 1],
        [0, 1],
        [1, 1],
      ],
    );
    expect(drawnLinkMiddle(calc, 0)).toBeUndefined();
    const transform = { scaleX: 2, scaleY: 2, scaleZ: 2, offsetX: 1, offsetY: 0, offsetZ: 0 };
    const paths = linkPaths({
      x: [1, 11],
      y: [0, 0],
      z: [0, 0],
      radius: [1, 1],
      source: calc.model.source,
      target: calc.model.target,
      drawn: Int32Array.of(0, 1),
      curve: [0, 0.1, 0],
    });
    keepLinkPaths(calc, paths, transform);
    expect(drawnLinkMiddle(calc, 0)).toEqual([2.5, 0, 0]);
    // Curved by a tenth of its 10 scene units: 1 unit, half a linear one.
    const apex = drawnLinkMiddle(calc, 1)!;
    expect(apex[0]).toBeCloseTo(2.5, 9);
    expect(apex[1]).toBeCloseTo(0.5, 9);
    expect(drawnLinkMiddle(calc, 2)).toBeUndefined();
  });
});

describe('graph3d link mesh', () => {
  it('tubes are cylinders from center to center, facing outwards', () => {
    const mesh = linkMesh({ ...BASE, tube: [0.5, 0.25] });
    expect(mesh.link.length).toBe(2 * 2 * SEGMENTS);
    expect(mesh.indices.length).toBe(2 * 6 * SEGMENTS);
    expect(Array.from(mesh.link.subarray(0, 2 * SEGMENTS)).every((k) => k === 0)).toBe(true);
    expect(Array.from(mesh.link.subarray(2 * SEGMENTS)).every((k) => k === 1)).toBe(true);
    expect(outwardFacing(mesh)).toBe(true);
    // The first link runs along x from 0 to 10, half a unit around its axis.
    const xs: number[] = [];
    for (let v = 0; v < 2 * SEGMENTS; v++) {
      xs.push(mesh.positions[3 * v]! + mesh.origin[0]);
      const y = mesh.positions[3 * v + 1]! + mesh.origin[1];
      const z = mesh.positions[3 * v + 2]! + mesh.origin[2];
      expect(Math.hypot(y, z)).toBeCloseTo(0.5, 5);
    }
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(10, 5);
    expect(Array.from(mesh.colors.subarray(0, 4))).toEqual([
      Math.fround(0.2),
      Math.fround(0.4),
      Math.fround(0.6),
      1,
    ]);
  });

  it("an arrowhead's tip is on the target's surface and the tube stops at its base", () => {
    const mesh = linkMesh({
      ...meshInput([0]),
      tube: [0.5, 0.25],
      arrows: { start: false, end: true, length: [3, 3] },
    });
    expect(mesh.link.length).toBe(2 * SEGMENTS + 3 * SEGMENTS + 1);
    expect(outwardFacing(mesh)).toBe(true);
    const x = (v: number): number => mesh.positions[3 * v]! + mesh.origin[0];
    // Tube: from the source's center to the base of the head, at 10 − 2 − 3.
    expect(x(0)).toBeCloseTo(0, 5);
    expect(x(SEGMENTS)).toBeCloseTo(5, 5);
    // Head: base vertices at 5, a base radius from the axis; tip vertices at 8.
    const base = 2 * SEGMENTS;
    expect(x(base)).toBeCloseTo(5, 5);
    expect(x(base + 1)).toBeCloseTo(8, 5);
    const y = mesh.positions[3 * base + 1]! + mesh.origin[1];
    const z = mesh.positions[3 * base + 2]! + mesh.origin[2];
    expect(Math.hypot(y, z)).toBeCloseTo(3 * ARROW_ASPECT, 5);
  });

  it('heads at both ends, without tubes, in per-link colors; a short link gets short heads', () => {
    const color = Float32Array.of(1, 0, 0, 1, 0, 0, 1, 1);
    const mesh = linkMesh({
      ...BASE,
      color,
      arrows: { start: true, end: true, length: [3, 30] },
    });
    expect(mesh.link.length).toBe(2 * 2 * (3 * SEGMENTS + 1));
    expect(outwardFacing(mesh)).toBe(true);
    const second = 2 * (3 * SEGMENTS + 1);
    expect(Array.from(mesh.colors.subarray(4 * second, 4 * second + 4))).toEqual([0, 0, 1, 1]);
    // The second link is 8 long between radii 2 and 1: its two heads share the 5 that is left.
    const zs: number[] = [];
    for (let v = second; v < mesh.link.length; v++)
      zs.push(mesh.positions[3 * v + 2]! + mesh.origin[2]);
    expect(Math.min(...zs)).toBeCloseTo(2, 5);
    expect(Math.max(...zs)).toBeCloseTo(7, 5);
  });

  it('a curved tube has a ring per point of its path, all its radius from the path', () => {
    const input = meshInput([0], { curve: [0.2, 0] });
    const mesh = linkMesh({ ...input, tube: [0.5, 0.25] });
    const rings = CURVE_SEGMENTS + 1;
    expect(mesh.link.length).toBe(rings * SEGMENTS);
    expect(mesh.indices.length).toBe(6 * SEGMENTS * CURVE_SEGMENTS);
    expect(outwardFacing(mesh)).toBe(true);
    for (let i = 0; i < rings; i++) {
      const c = pointOf(input.paths, 0, i);
      for (let s = 0; s < SEGMENTS; s++) {
        const v = 3 * (i * SEGMENTS + s);
        const d = [0, 1, 2].map((k) => mesh.positions[v + k]! + mesh.origin[k]! - c[k]!);
        expect(Math.hypot(d[0]!, d[1]!, d[2]!)).toBeCloseTo(0.5, 5);
      }
    }
  });

  it("the head of a curved link and of a self-link has its tip on the node's surface", () => {
    const tipOf = (mesh: LinkMesh, head: number): number[] =>
      [0, 1, 2].map((k) => mesh.positions[3 * (head + 1) + k]! + mesh.origin[k]!);
    const curved = linkMesh({
      ...meshInput([0], { curve: [0.3, 0] }),
      arrows: { start: false, end: true, length: [2, 2] },
    });
    expect(curved.link.length).toBe(3 * SEGMENTS + 1);
    expect(outwardFacing(curved)).toBe(true);
    const tip = tipOf(curved, 0);
    // On the sphere of radius 2 around (10, 0, 0), on the side the curve comes from (+y).
    expect(Math.hypot(tip[0]! - 10, tip[1]!, tip[2]!)).toBeCloseTo(2, 5);
    expect(tip[1]).toBeGreaterThan(0.5);

    const ring = meshInput([0], {
      source: Int32Array.of(1),
      target: Int32Array.of(1),
      loop: [0],
      loopReach: 6,
    });
    const loop = linkMesh({
      ...ring,
      tube: [0.2],
      arrows: { start: false, end: true, length: [1.5] },
    });
    expect(outwardFacing(loop)).toBe(true);
    // The tube's rings come first, then the one head.
    const head = loop.link.length - (3 * SEGMENTS + 1);
    expect(head % SEGMENTS).toBe(0);
    expect(head).toBeGreaterThan(SEGMENTS);
    const end = tipOf(loop, head);
    expect(Math.hypot(end[0]! - 10, end[1]!, end[2]!)).toBeCloseTo(2, 5);
  });

  it('nothing for no links, or for nodes at the same place', () => {
    expect(linkMesh({ ...meshInput([]), tube: [1, 1] }).positions.length).toBe(0);
    const same = linkMesh({ ...meshInput([0, 1], { x: [0, 0, 0], z: [0, 0, 0] }), tube: [1, 1] });
    expect(same.positions.length).toBe(0);
    expect(same.indices.length).toBe(0);
    expect(same.origin).toEqual([0, 0, 0]);
  });
});

describe('graph3d plane outlines', () => {
  it('one rectangle per plane around the nodes, with a margin', () => {
    const calc = calcOf(
      [
        [0, 0, 40],
        [100, 50, 40],
        [50, 25, -40],
        [NaN, NaN, NaN],
      ],
      [],
    );
    const planes = {
      axis: 2 as const,
      at: Float64Array.of(40, -40),
      rank: Int32Array.of(0, 0, 1, 1),
    };
    const out = planeOutlines(calc, planes, 0.1)!;
    expect(out.x.length).toBe(12);
    expect(Array.from(out.z)).toEqual([40, 40, 40, 40, 40, NaN, -40, -40, -40, -40, -40, NaN]);
    expect(Array.from(out.x.subarray(0, 6))).toEqual([-10, 110, 110, -10, -10, NaN]);
    expect(Array.from(out.y.subarray(0, 6))).toEqual([-10, -10, 60, 60, -10, NaN]);
    const along = planeOutlines(calc, { ...planes, axis: 0, at: Float64Array.of(7) })!;
    expect(Array.from(along.x)).toEqual([7, 7, 7, 7, 7, NaN]);
    expect(planeOutlines(calc, { ...planes, at: new Float64Array(0) })).toBeUndefined();
  });
});
