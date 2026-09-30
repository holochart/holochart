/**
 * Isosurface extraction of `isosurface` and `volume` (plan E14.7, E14.8): a port of plotly.js
 * `isosurface/convert.js` `generateIsoMeshes`, so Plotly figures draw the same triangles.
 *
 * Plotly doesn't run marching cubes: it cuts every grid cell into five tetrahedra — the four
 * corner tetrahedra `A`–`D` and the central one `E`, mirrored in every other cell so neighbouring
 * cells share their faces — and cuts each tetrahedron by the value range `[min, max]` (marching
 * tetrahedra, no ambiguous cases): where some corners are inside the range and some outside, the
 * boundary surface is a triangle or a quad through the edge points where the value reaches the
 * range (linear interpolation). What is drawn:
 *
 * - **Surfaces** (`surface.show`): `surface.count` levels spread evenly over `[isomin, isomax]`
 *   (one level: the middle); level `l` is the boundary of the range `[l, data max]` or
 *   `[data min, l]` (whichever side is larger), i.e. the surface where the value is `l`.
 *   `surface.pattern` picks the tetrahedra: `'all'`, `'odd'` / `'even'` (only in the cells with an
 *   odd / even `i + j + k`, a checkerboard) or a combination of `A`–`E`.
 * - **Spaceframe** (`spaceframe.show`): the central tetrahedra (and their parts) inside
 *   `[isomin, isomax]`, drawn as their faces.
 * - **Caps** (`caps.{x,y,z}.show`): the parts of the grid's boundary faces inside
 *   `[isomin, isomax]`, cut along the range; **slices** (`slices.{x,y,z}.show`): the same on planes
 *   through the grid at `locations` (between grid points: interpolated), or at every inner grid
 *   plane without locations.
 * - **Fill** (`surface.fill`, `caps.*.fill`, `slices.*.fill`, `spaceframe.fill` < 1): every
 *   triangle becomes a frame of three quads around a hole: the triangle scaled by
 *   `sqrt(1 − fill)` about its centroid is left out, so `fill` is the drawn share of its area.
 *
 * Vertices carry the grid value (interpolated), which the colorscale maps. Like Plotly, triangles
 * don't share vertices (except within one filled triangle, and the grid points of the spaceframe),
 * so the mesh is faceted whatever the shading. Plotly's quirks are kept on purpose: slices between
 * grid points are drawn once per setup range (twice where both ranges hold them), cap and slice
 * triangles are tried against Plotly's wider setup ranges first and then clipped to
 * `[isomin, isomax]` (up to three passes).
 *
 * Differences from Plotly: grid values come from the axis values (`xs`, `ys`, `zs`) rather than
 * each point's own coordinate (the same on a valid grid), spaceframe corners are the right grid
 * points for every nesting order (Plotly's indices assume `'zyx'`), slice locations on a
 * descending axis are placed where they are (Plotly's assume ascending axes), and edge points
 * stay on their edge (Plotly's 1e-9 offset extrapolates past it for value steps near 1e-9).
 *
 * The extraction is a pure function of typed arrays (the grid and the options), so it can run in a
 * worker; it runs synchronously in calc for now.
 */
import { findNearestOnAxis, gridCoordinate, gridIndex, type IsoGrid } from './grid.ts';

/** One axis' cap. */
export interface IsoCapOptions {
  readonly show: boolean;
  readonly fill: number;
}

/** One axis' slices. */
export interface IsoSliceOptions {
  readonly show: boolean;
  readonly fill: number;
  /** Linear coordinates; empty: every inner grid plane. */
  readonly locations: readonly number[];
}

/** What {@link extractIsoMesh} draws (defaulted trace attributes). */
export interface IsoMeshOptions {
  /** The value range (Plotly's `_vMin` / `_vMax`: `isomin` / `isomax` or the data extent). */
  readonly isomin: number;
  readonly isomax: number;
  readonly surface: {
    readonly show: boolean;
    readonly count: number;
    readonly fill: number;
    /** `'all'`, `'odd'`, `'even'` or `A`–`E` joined with `+`. */
    readonly pattern: string;
  };
  readonly spaceframe: { readonly show: boolean; readonly fill: number };
  readonly caps: {
    readonly x: IsoCapOptions;
    readonly y: IsoCapOptions;
    readonly z: IsoCapOptions;
  };
  readonly slices: {
    readonly x: IsoSliceOptions;
    readonly y: IsoSliceOptions;
    readonly z: IsoSliceOptions;
  };
}

/** The extracted triangles. */
export interface IsoMesh {
  /** Vertices (linear coordinates) and their values. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly value: Float64Array;
  readonly count: number;
  /** Three vertex indices per triangle. */
  readonly triangles: Uint32Array;
}

/** A point: x, y, z (linear) and value. */
type XYZV = [number, number, number, number];

const MAX_PASS = 3;

/** A growable float64 column. */
class Column {
  data = new Float64Array(1024);
  push(v: number, at: number): void {
    if (at >= this.data.length) {
      const next = new Float64Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[at] = v;
  }
}

function between(a: XYZV, b: XYZV, r: number): XYZV {
  return [
    a[0] * (1 - r) + r * b[0],
    a[1] * (1 - r) + r * b[1],
    a[2] * (1 - r) + r * b[2],
    a[3] * (1 - r) + r * b[3],
  ];
}

/** Extract the iso mesh of `grid` (see the module comment). */
export function extractIsoMesh(grid: IsoGrid, options: IsoMeshOptions): IsoMesh {
  const width = grid.xs.length;
  const height = grid.ys.length;
  const depth = grid.zs.length;
  const values = grid.value;
  const minValues = grid.valueMin;
  const maxValues = grid.valueMax;
  const vMin = options.isomin;
  const vMax = options.isomax;

  const cols = [new Column(), new Column(), new Column(), new Column()];
  let numVertices = 0;
  let tri = new Uint32Array(3072);
  let numFaces = 0;
  let groupStart = 0;
  /** Vertex of each grid point (-1: not added yet; the spaceframe's shared corners). */
  let gridVertex: Int32Array | null = null;

  let drawingSurface = false;
  let drawingSpaceframe = false;
  let activeFill = 1;

  const idx = (i: number, j: number, k: number): number => gridIndex(grid, i, j, k);
  const [si, sj, sk] = grid.strides;
  /** The point of grid index (column index) `q`. */
  const point = (q: number): XYZV => [
    gridCoordinate(grid, 0, Math.floor(q / si) % width),
    gridCoordinate(grid, 1, Math.floor(q / sj) % height),
    gridCoordinate(grid, 2, Math.floor(q / sk) % depth),
    values[q]!,
  ];

  function addVertex(p: XYZV): number {
    for (let c = 0; c < 4; c++) cols[c]!.push(p[c]!, numVertices);
    return numVertices++;
  }

  function gridPointVertex(q: number): number {
    gridVertex ??= new Int32Array(grid.len).fill(-1);
    let v = gridVertex[q]!;
    if (v < 0) gridVertex[q] = v = addVertex(point(q));
    return v;
  }

  /** A vertex of the current group at exactly `p` (Plotly's `findVertexId`), or -1. */
  function findVertexId(p: XYZV): number {
    const [xs, ys, zs] = [cols[0]!.data, cols[1]!.data, cols[2]!.data];
    for (let f = groupStart; f < numVertices; f++) {
      if (p[0] === xs[f] && p[1] === ys[f] && p[2] === zs[f]) return f;
    }
    return -1;
  }

  function addFace(a: number, b: number, c: number): void {
    if (numFaces * 3 + 3 > tri.length) {
      const next = new Uint32Array(tri.length * 2);
      next.set(tri);
      tri = next;
    }
    tri[numFaces * 3] = a;
    tri[numFaces * 3 + 1] = b;
    tri[numFaces * 3 + 2] = c;
    numFaces++;
  }

  /**
   * One triangle (or, with `fill` < 1, its frame of three quads): vertex `abc[n] ≥ 0` is that
   * grid point, else a new vertex (shared within the triangle's group).
   */
  function drawTri(xyzv: XYZV[], abc: readonly number[]): void {
    groupStart = numVertices;
    let tris: XYZV[][] = [xyzv];
    let abcs: (readonly number[])[] = [abc];
    if (activeFill < 1 && activeFill > 0) {
      const [A, B, C] = xyzv as [XYZV, XYZV, XYZV];
      const G: XYZV = [0, 1, 2, 3].map((s) => (A[s]! + B[s]! + C[s]!) / 3) as XYZV;
      const r = Math.sqrt(1 - activeFill);
      const p1 = between(G, A, r);
      const p2 = between(G, B, r);
      const p3 = between(G, C, r);
      const [a, b, c] = abc as [number, number, number];
      tris = [
        [A, B, p2],
        [p2, p1, A],
        [B, C, p3],
        [p3, p2, B],
        [C, A, p1],
        [p1, p3, C],
      ];
      abcs = [
        [a, b, -1],
        [-1, -1, a],
        [b, c, -1],
        [-1, -1, b],
        [c, a, -1],
        [-1, -1, c],
      ];
    }
    for (let f = 0; f < tris.length; f++) {
      const pts = tris[f]!;
      const ids = abcs[f]!;
      const v = [0, 0, 0];
      for (let n = 0; n < 3; n++) {
        const id = ids[n]! > -1 ? gridPointVertex(ids[n]!) : findVertexId(pts[n]!);
        v[n] = id > -1 ? id : addVertex(pts[n]!);
      }
      addFace(v[0]!, v[1]!, v[2]!);
    }
  }

  function drawQuad(xyzv: XYZV[], abcd: readonly number[]): void {
    drawTri([xyzv[0]!, xyzv[1]!, xyzv[2]!], [abcd[0]!, abcd[1]!, abcd[2]!]);
    drawTri([xyzv[2]!, xyzv[3]!, xyzv[0]!], [abcd[2]!, abcd[3]!, abcd[0]!]);
  }

  function drawTetra(xyzv: XYZV[], abcd: readonly number[]): void {
    const make = (i: number, j: number, k: number) =>
      drawTri([xyzv[i]!, xyzv[j]!, xyzv[k]!], [abcd[i]!, abcd[j]!, abcd[k]!]);
    make(0, 1, 2);
    make(3, 0, 1);
    make(2, 3, 0);
    make(1, 2, 3);
  }

  /** Where the value reaches the range on the edge from `pointOut` to `pointIn`. */
  function calcIntersection(pointOut: XYZV, pointIn: XYZV, min: number, max: number): XYZV {
    let value = pointOut[3];
    if (value < min) value = min;
    if (value > max) value = max;
    // Plotly's small offset, which also solves tiny caps. Clamped to the edge: with value steps
    // near 1e-9 the offset would extrapolate past it (or divide by zero).
    const ratio = (pointOut[3] - value) / (pointOut[3] - pointIn[3] + 0.000000001);
    return between(pointOut, pointIn, ratio >= 0 ? Math.min(1, ratio) : 0);
  }

  const inRange = (v: number, min: number, max: number): boolean => v >= min && v <= max;

  const vErr = 0.001 * (vMax - vMin);
  const almostInFinalRange = (v: number): boolean => v >= vMin - vErr && v <= vMax + vErr;

  /** A triangle of a cap or slice, cut to `[min, max]` (retried in the final range). */
  function tryCreateTri(xyzv: XYZV[], min: number, max: number, nPass = 1): boolean {
    let result = false;
    const ok = [
      inRange(xyzv[0]![3], min, max),
      inRange(xyzv[1]![3], min, max),
      inRange(xyzv[2]![3], min, max),
    ];
    if (!ok[0] && !ok[1] && !ok[2]) return false;
    const none = [-1, -1, -1];
    const tryDrawTri = (pts: XYZV[]): boolean => {
      if (
        almostInFinalRange(pts[0]![3]) &&
        almostInFinalRange(pts[1]![3]) &&
        almostInFinalRange(pts[2]![3])
      ) {
        drawTri(pts, none);
        return true;
      }
      if (nPass < MAX_PASS) return tryCreateTri(pts, vMin, vMax, nPass + 1);
      return false;
    };
    if (ok[0] && ok[1] && ok[2]) return tryDrawTri(xyzv) || result;
    let interpolated = false;
    for (const e of [
      [0, 1, 2],
      [2, 0, 1],
      [1, 2, 0],
    ] as const) {
      if (ok[e[0]] && ok[e[1]] && !ok[e[2]]) {
        const A = xyzv[e[0]]!;
        const B = xyzv[e[1]]!;
        const C = xyzv[e[2]]!;
        const p1 = calcIntersection(C, A, min, max);
        const p2 = calcIntersection(C, B, min, max);
        result = tryDrawTri([p2, p1, A]) || result;
        result = tryDrawTri([A, B, p2]) || result;
        interpolated = true;
      }
    }
    if (interpolated) return result;
    for (const e of [
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
    ] as const) {
      if (ok[e[0]] && !ok[e[1]] && !ok[e[2]]) {
        const A = xyzv[e[0]]!;
        const B = xyzv[e[1]]!;
        const C = xyzv[e[2]]!;
        const p1 = calcIntersection(B, A, min, max);
        const p2 = calcIntersection(C, A, min, max);
        result = tryDrawTri([p2, p1, A]) || result;
      }
    }
    return result;
  }

  /** One tetrahedron (grid indices `abcd`) cut by `[min, max]`. */
  function tryCreateTetra(abcd: readonly number[], min: number, max: number): void {
    const v0 = values[abcd[0]!]!;
    const v1 = values[abcd[1]!]!;
    const v2 = values[abcd[2]!]!;
    const v3 = values[abcd[3]!]!;
    const ok = [
      inRange(v0, min, max),
      inRange(v1, min, max),
      inRange(v2, min, max),
      inRange(v3, min, max),
    ];
    const inside = +ok[0]! + +ok[1]! + +ok[2]! + +ok[3]!;
    if (inside === 0) return;
    if (inside === 4) {
      if (drawingSpaceframe) drawTetra(abcd.map(point), abcd);
      return;
    }
    const xyzv = abcd.map(point);
    if (inside === 3) {
      for (const e of [
        [0, 1, 2, 3],
        [3, 0, 1, 2],
        [2, 3, 0, 1],
        [1, 2, 3, 0],
      ] as const) {
        if (ok[e[0]] && ok[e[1]] && ok[e[2]] && !ok[e[3]]) {
          const A = xyzv[e[0]]!;
          const B = xyzv[e[1]]!;
          const C = xyzv[e[2]]!;
          const D = xyzv[e[3]]!;
          if (drawingSpaceframe) drawTri([A, B, C], [abcd[e[0]]!, abcd[e[1]]!, abcd[e[2]]!]);
          else {
            const p1 = calcIntersection(D, A, min, max);
            const p2 = calcIntersection(D, B, min, max);
            const p3 = calcIntersection(D, C, min, max);
            drawTri([p1, p2, p3], [-1, -1, -1]);
          }
        }
      }
      return;
    }
    if (inside === 2) {
      for (const e of [
        [0, 1, 2, 3],
        [1, 2, 3, 0],
        [2, 3, 0, 1],
        [3, 0, 1, 2],
        [0, 2, 3, 1],
        [1, 3, 2, 0],
      ] as const) {
        if (ok[e[0]] && ok[e[1]] && !ok[e[2]] && !ok[e[3]]) {
          const A = xyzv[e[0]]!;
          const B = xyzv[e[1]]!;
          const C = xyzv[e[2]]!;
          const D = xyzv[e[3]]!;
          const p1 = calcIntersection(C, A, min, max);
          const p2 = calcIntersection(C, B, min, max);
          const p3 = calcIntersection(D, B, min, max);
          const p4 = calcIntersection(D, A, min, max);
          if (drawingSpaceframe) {
            drawTri([A, p4, p1], [abcd[e[0]]!, -1, -1]);
            drawTri([B, p2, p3], [abcd[e[1]]!, -1, -1]);
          } else drawQuad([p1, p2, p3, p4], [-1, -1, -1, -1]);
        }
      }
      return;
    }
    for (const e of [
      [0, 1, 2, 3],
      [1, 2, 3, 0],
      [2, 3, 0, 1],
      [3, 0, 1, 2],
    ] as const) {
      if (ok[e[0]] && !ok[e[1]] && !ok[e[2]] && !ok[e[3]]) {
        const A = xyzv[e[0]]!;
        const B = xyzv[e[1]]!;
        const C = xyzv[e[2]]!;
        const D = xyzv[e[3]]!;
        const p1 = calcIntersection(B, A, min, max);
        const p2 = calcIntersection(C, A, min, max);
        const p3 = calcIntersection(D, A, min, max);
        if (drawingSpaceframe) {
          drawTri([A, p1, p2], [abcd[e[0]]!, -1, -1]);
          drawTri([A, p2, p3], [abcd[e[0]]!, -1, -1]);
          drawTri([A, p3, p1], [abcd[e[0]]!, -1, -1]);
        } else drawTri([p1, p2, p3], [-1, -1, -1]);
      }
    }
  }

  /** Whether `style` (a pattern, null: all) includes tetrahedron `char`. */
  const styleIncludes = (style: string | null, char: string): boolean =>
    style === 'all' || style === null || style.includes(char);

  function addCube(style: string | null, p: readonly number[], min: number, max: number): void {
    const [p000, p001, p010, p011, p100, p101, p110, p111] = p as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    if (drawingSurface) {
      if (styleIncludes(style, 'A')) tryCreateTetra([p000, p001, p010, p100], min, max);
      if (styleIncludes(style, 'B')) tryCreateTetra([p001, p010, p011, p111], min, max);
      if (styleIncludes(style, 'C')) tryCreateTetra([p001, p100, p101, p111], min, max);
      if (styleIncludes(style, 'D')) tryCreateTetra([p010, p100, p110, p111], min, max);
      if (styleIncludes(style, 'E')) tryCreateTetra([p001, p010, p100, p111], min, max);
    }
    if (drawingSpaceframe) tryCreateTetra([p001, p010, p100, p111], min, max);
  }

  /** Whether any corner of the cell could produce something for `[min, max]`. */
  function cellActive(p: readonly number[], min: number, max: number): boolean {
    let inside = 0;
    for (let n = 0; n < 8; n++) if (inRange(values[p[n]!]!, min, max)) inside++;
    // Surfaces need a boundary through the cell; the spaceframe draws inside cells too.
    return inside > 0 && (drawingSpaceframe || inside < 8);
  }

  function begin3dCell(
    style: string | null,
    p: readonly number[],
    min: number,
    max: number,
    isOdd: boolean,
  ): void {
    if (!cellActive(p, min, max)) return;
    let cellStyle = style;
    if (isOdd) {
      if (drawingSurface && style === 'even') cellStyle = null;
      addCube(cellStyle, p, min, max);
    } else {
      if (drawingSurface && style === 'odd') cellStyle = null;
      addCube(cellStyle, [p[7]!, p[6]!, p[5]!, p[4]!, p[3]!, p[2]!, p[1]!, p[0]!], min, max);
    }
  }

  function draw3d(style: string | null, min: number, max: number): void {
    const p = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 1; k < depth; k++) {
      for (let j = 1; j < height; j++) {
        for (let i = 1; i < width; i++) {
          p[0] = idx(i - 1, j - 1, k - 1);
          p[1] = idx(i - 1, j - 1, k);
          p[2] = idx(i - 1, j, k - 1);
          p[3] = idx(i - 1, j, k);
          p[4] = idx(i, j - 1, k - 1);
          p[5] = idx(i, j - 1, k);
          p[6] = idx(i, j, k - 1);
          p[7] = idx(i, j, k);
          begin3dCell(style, p, min, max, (i + j + k) % 2 === 1);
        }
      }
    }
  }

  type Pair = [boolean, boolean] | [];

  function addRect(
    a: number,
    b: number,
    c: number,
    d: number,
    min: number,
    max: number,
    prev: Pair,
  ): Pair {
    return [
      prev[0] === true ? true : tryCreateTri([point(a), point(b), point(c)], min, max),
      prev[1] === true ? true : tryCreateTri([point(c), point(d), point(a)], min, max),
    ];
  }

  function begin2dCell(
    p00: number,
    p01: number,
    p10: number,
    p11: number,
    min: number,
    max: number,
    isOdd: boolean,
    prev: Pair,
  ): Pair {
    return isOdd
      ? addRect(p00, p01, p11, p10, min, max, prev)
      : addRect(p01, p11, p10, p00, min, max, prev);
  }

  const sizes = [width, height, depth];
  /** The column index of the grid point with index `plane` on `axis`, `r` and `c` on the others. */
  const at = (
    axis: number,
    plane: number,
    ra: number,
    r: number,
    ca: number,
    c: number,
  ): number => {
    const g = [0, 0, 0];
    g[axis] = plane;
    g[ra] = r;
    g[ca] = c;
    return idx(g[0]!, g[1]!, g[2]!);
  };

  /**
   * Caps or exact slices at grid planes `items` of axis `axis` (Plotly's `draw2dX/Y/Z`: the cells
   * of the plane over its other two axes taken cyclically, `r` then `c`, walked `c` outer).
   */
  function draw2d(
    axis: 0 | 1 | 2,
    items: readonly number[],
    min: number,
    max: number,
    prev: Pair[] | undefined,
  ): Pair[] {
    const result: Pair[] = [];
    const ra = (axis + 1) % 3;
    const ca = (axis + 2) % 3;
    let n = 0;
    for (const q of items) {
      for (let c = 1; c < sizes[ca]!; c++) {
        for (let r = 1; r < sizes[ra]!; r++) {
          result.push(
            begin2dCell(
              at(axis, q, ra, r - 1, ca, c - 1),
              at(axis, q, ra, r - 1, ca, c),
              at(axis, q, ra, r, ca, c - 1),
              at(axis, q, ra, r, ca, c),
              min,
              max,
              (q + r + c) % 2 === 1,
              prev?.[n] ?? [],
            ),
          );
          n++;
        }
      }
    }
    return result;
  }

  /**
   * Slices between grid planes `q − 1` and `q` of axis `axis`, at ratio `ratios[n]` from `q`
   * (Plotly's `drawSectionX/Y/Z` and `beginSection`: the other two axes in order, `r` then `c`).
   */
  function drawSection(
    axis: 0 | 1 | 2,
    items: readonly number[],
    min: number,
    max: number,
    ratios: readonly number[],
  ): void {
    const ra = axis === 0 ? 1 : 0;
    const ca = axis === 2 ? 1 : 2;
    for (let n = 0; n < items.length; n++) {
      const q = items[n]!;
      const r0 = ratios[n]!;
      const cut = (r: number, c: number): XYZV =>
        between(point(at(axis, q, ra, r, ca, c)), point(at(axis, q - 1, ra, r, ca, c)), r0);
      for (let c = 1; c < sizes[ca]!; c++) {
        for (let r = 1; r < sizes[ra]!; r++) {
          const A = cut(r, c);
          const B = cut(r, c - 1);
          const C = cut(r - 1, c - 1);
          const D = cut(r - 1, c);
          tryCreateTri([A, B, C], min, max);
          tryCreateTri([C, D, A], min, max);
        }
      }
    }
  }

  const range = (a: number, b: number): number[] => {
    const out: number[] = [];
    for (let q = a; q < b; q++) out.push(q);
    return out;
  };

  if (grid.len > 0 && Number.isFinite(vMin) && Number.isFinite(vMax)) {
    const { surface, spaceframe } = options;
    if (spaceframe.show && spaceframe.fill) {
      activeFill = spaceframe.fill;
      drawingSpaceframe = true;
      draw3d(null, vMin, vMax);
      drawingSpaceframe = false;
    }
    if (surface.show && surface.fill) {
      activeFill = surface.fill;
      const count = Math.max(1, Math.round(surface.count));
      for (let q = 0; q < count; q++) {
        const ratio = count === 1 ? 0.5 : q / (count - 1);
        const level = (1 - ratio) * vMin + ratio * vMax;
        const d1 = Math.abs(level - minValues);
        const d2 = Math.abs(level - maxValues);
        const [lo, hi] = d1 > d2 ? [minValues, level] : [level, maxValues];
        drawingSurface = true;
        draw3d(surface.pattern, lo, hi);
        drawingSurface = false;
      }
    }
    const setupMinMax: [number, number][] = [
      [Math.min(vMin, maxValues), Math.max(vMin, maxValues)],
      [Math.min(minValues, vMax), Math.max(minValues, vMax)],
    ];
    const axisValues = [grid.xs, grid.ys, grid.zs];
    for (const axis of [0, 1, 2] as const) {
      const letter = (['x', 'y', 'z'] as const)[axis];
      const n = sizes[axis]!;
      const preRes: Pair[][] = [];
      for (const [activeMin, activeMax] of setupMinMax) {
        let count = 0;
        const slice = options.slices[letter];
        if (slice.show && slice.fill) {
          activeFill = slice.fill;
          let exact: number[] = [];
          const ceil: number[] = [];
          const ratios: number[] = [];
          if (slice.locations.length) {
            for (const location of slice.locations) {
              const near = findNearestOnAxis(location, axisValues[axis]!);
              // Ascending ids → grid indices (data order): on a descending axis the plane
              // between ids q − 1 and q is between grid indices n − 1 − q and n − q.
              if (grid.descending[axis]) {
                if (near.distRatio === 0) exact.push(n - 1 - near.id);
                else if (near.id > 0) {
                  ceil.push(n - near.id);
                  ratios.push(1 - near.distRatio);
                }
              } else if (near.distRatio === 0) exact.push(near.id);
              else if (near.id > 0) {
                ceil.push(near.id);
                ratios.push(near.distRatio);
              }
            }
          } else exact = range(1, n - 1);
          if (ceil.length > 0) {
            // Plotly draws these once per setup range (its section results are not reused).
            drawSection(axis, ceil, activeMin, activeMax, ratios);
            count++;
          }
          if (exact.length > 0) {
            preRes[count] = draw2d(axis, exact, activeMin, activeMax, preRes[count]);
            count++;
          }
        }
        const cap = options.caps[letter];
        if (cap.show && cap.fill) {
          activeFill = cap.fill;
          preRes[count] = draw2d(axis, [0, n - 1], activeMin, activeMax, preRes[count]);
        }
      }
    }
  }

  if (numFaces === 0) numVertices = 0;
  return {
    x: cols[0]!.data.slice(0, numVertices),
    y: cols[1]!.data.slice(0, numVertices),
    z: cols[2]!.data.slice(0, numVertices),
    value: cols[3]!.data.slice(0, numVertices),
    count: numVertices,
    triangles: tri.slice(0, numFaces * 3),
  };
}
