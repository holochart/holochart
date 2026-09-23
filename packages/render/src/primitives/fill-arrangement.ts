/**
 * Exact fill-rule triangulation for self-intersecting / overlapping rings (plan E2.6). Pure CPU,
 * no WebGL.
 *
 * `earcut` alone assumes simple rings (first ring outer, the rest holes) and produces undefined
 * output for a self-intersecting "toself" ring such as a bowtie or pentagram. Instead of a GPU
 * stencil pass (exact, but needs a stencil buffer — off by default since three r163 — plus two
 * passes per primitive, which breaks single-draw batching), we build the **planar arrangement** of
 * all ring edges on the CPU:
 *
 * 1. Normalize the polygon's 2D coordinates to its bounding box, so tolerances are scale-free
 *    (ms timestamps and 0–1 values behave the same; the map is affine, so topology is unchanged).
 * 2. Split every edge at every crossing / T-junction / collinear overlap (sweep over x-sorted
 *    edges). Vertices closer than {@link ARRANGEMENT_SNAP} (normalized units) are merged.
 * 3. Accumulate each undirected edge's multiplicity: `net` (directed, for nonzero) and `count`
 *    (for even-odd). Edges that cancel (net 0 / even count) are dropped.
 * 4. Trace the faces of the resulting planar graph (angle-sorted half-edges). Bounded faces are
 *    counter-clockwise; each connected component also has one clockwise outer loop.
 * 5. Winding numbers: crossing edge `e` changes the winding by its weight, so a BFS over faces
 *    gives every face's winding relative to its component's outside; the outside of a component
 *    equals the winding of the smallest bounded face (of another component) containing it.
 * 6. Fill faces where the rule holds (`nonzero`: w ≠ 0, `evenodd`: w odd), triangulating each with
 *    earcut using the outer loops of components nested directly inside it as holes.
 *
 * ## Limits
 * - O(E log E + K) for E edges and K crossings plus an O(C · F) nesting test for C components and F
 *   face vertices — fine for "toself" fills (hundreds to tens of thousands of vertices) but not
 *   meant for choropleth-scale batches; those use the earcut fast path (`fillRule: 'simple'`).
 * - Floating-point predicates are not exact: near-degenerate input (crossings within the snap
 *   tolerance of each other, nearly-collinear overlaps) may produce slivers or miss a sliver.
 * - Faces whose boundary touches itself are handed to earcut as-is; earcut handles the common
 *   touching cases but is not guaranteed on pathological ones.
 */
import earcut from 'earcut';

/** Fill rules supported by the exact arrangement path. */
export type FillWindingRule = 'nonzero' | 'evenodd';

/** Vertex merge tolerance in bbox-normalized units (the polygon's bbox maps to [0, 1]²). */
export const ARRANGEMENT_SNAP = 1e-10;

/** One polygon's input to {@link triangulateArrangement}. */
export interface ArrangementInput {
  /** Projected 2D coordinates, 2 per vertex. Must be finite. */
  uv: ArrayLike<number>;
  /** Original xyz, 3 per vertex; used to place (interpolate) the output vertices. */
  xyz: ArrayLike<number>;
  /** Start vertex of each ring (ascending); the last ring runs to the end of `uv`. */
  ringStarts: ArrayLike<number>;
}

/** A filled face of the arrangement: boundary loop plus hole loops, as vertex ids. */
export interface ArrangementFace {
  loop: number[];
  holes: number[][];
  winding: number;
}

/** Result of {@link triangulateArrangement}. */
export interface ArrangementResult {
  /** Output vertices, xyz, 3 per vertex (input vertices after merging, plus split points). */
  xyz: number[];
  /** Triangles as vertex-id triplets into `xyz`. */
  triangles: number[];
  /** The filled faces (for tests / debugging). */
  faces: ArrangementFace[];
}

const EMPTY: ArrangementResult = { xyz: [], triangles: [], faces: [] };

/**
 * Triangulate the region of one polygon (any number of rings, which may self-intersect and
 * overlap) that is filled under `rule`. See the module docs for the algorithm and its limits.
 */
export function triangulateArrangement(
  input: ArrangementInput,
  rule: FillWindingRule,
): ArrangementResult {
  const n = Math.floor(input.uv.length / 2);
  if (n < 3) return EMPTY;

  // 1. Normalize to the bbox.
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    const u = input.uv[2 * i]!;
    const v = input.uv[2 * i + 1]!;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const spanU = maxU - minU;
  const spanV = maxV - minV;
  // Zero-area (collinear) input or non-finite coordinates: nothing to fill.
  if (!(spanU > 0) || !(spanV > 0) || !Number.isFinite(spanU) || !Number.isFinite(spanV)) {
    return EMPTY;
  }

  const store = createVertexStore();
  const ids = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    ids[i] = store.add(
      (input.uv[2 * i]! - minU) / spanU,
      (input.uv[2 * i + 1]! - minV) / spanV,
      input.xyz[3 * i]!,
      input.xyz[3 * i + 1]!,
      input.xyz[3 * i + 2]!,
    );
  }

  // Segments (directed, as given by the rings), skipping ones that collapsed to a point.
  const segA: number[] = [];
  const segB: number[] = [];
  const ringCount = input.ringStarts.length;
  for (let r = 0; r < ringCount; r++) {
    const start = input.ringStarts[r]!;
    const end = r + 1 < ringCount ? input.ringStarts[r + 1]! : n;
    if (end - start < 2) continue;
    for (let i = start; i < end; i++) {
      const a = ids[i]!;
      const b = ids[i + 1 < end ? i + 1 : start]!;
      if (a !== b) {
        segA.push(a);
        segB.push(b);
      }
    }
  }

  // 2. Split segments at intersections.
  const splits = findSplits(store, segA, segB);
  const { edgeLo, edgeHi, weight } = accumulateEdges(store, segA, segB, splits, rule);
  if (edgeLo.length < 3) return { ...EMPTY, xyz: store.xyz };

  // 4. Faces of the planar graph.
  const graph = traceFaces(store, edgeLo, edgeHi);

  // 5. Windings.
  const winding = computeWindings(graph, weight);

  // 6. Fill + triangulate.
  const faces: ArrangementFace[] = [];
  const triangles: number[] = [];
  const holesOf = new Map<number, number[][]>();
  for (let c = 0; c < graph.componentCount; c++) {
    const container = graph.container[c]!;
    const outer = graph.componentOuter[c]!;
    if (container < 0 || outer < 0) continue;
    let list = holesOf.get(container);
    if (!list) holesOf.set(container, (list = []));
    list.push(graph.faceLoops[outer]!);
  }
  for (let f = 0; f < graph.faceLoops.length; f++) {
    if (!(graph.faceArea[f]! > 0)) continue;
    const w = winding[f]!;
    const filled = rule === 'nonzero' ? w !== 0 : (w & 1) !== 0;
    if (!filled) continue;
    const loop = graph.faceLoops[f]!;
    const holes = holesOf.get(f) ?? [];
    faces.push({ loop, holes, winding: w });
    triangulateLoops(store, loop, holes, triangles);
  }
  return { xyz: store.xyz, triangles, faces };
}

// ---------------------------------------------------------------------------------------------
// Vertex store: merges points within ARRANGEMENT_SNAP (Chebyshev) using a hash grid.

interface VertexStore {
  /** Normalized coordinates, 2 per vertex. */
  nuv: number[];
  /** Output coordinates, 3 per vertex. */
  xyz: number[];
  count(): number;
  add(u: number, v: number, x: number, y: number, z: number): number;
}

/**
 * Hash-grid cell size (normalized units). Coarser than the snap tolerance so both cell indices
 * pack into one exact float64 key (≤ 2^24 cells per axis); only the cells overlapping the
 * ±SNAP box around a query are probed, which is almost always just one.
 */
const GRID_CELL = 1e-7;
const GRID_AXIS = 2 ** 24;

function createVertexStore(): VertexStore {
  const nuv: number[] = [];
  const xyz: number[] = [];
  const grid = new Map<number, number[]>();
  // +2 keeps slightly negative (snapped) coordinates in range.
  const cell = (c: number): number => Math.floor(c / GRID_CELL) + 2;
  return {
    nuv,
    xyz,
    count: () => nuv.length / 2,
    add(u, v, x, y, z) {
      const u0 = cell(u - ARRANGEMENT_SNAP);
      const u1 = cell(u + ARRANGEMENT_SNAP);
      const v0 = cell(v - ARRANGEMENT_SNAP);
      const v1 = cell(v + ARRANGEMENT_SNAP);
      for (let cu = u0; cu <= u1; cu++) {
        for (let cv = v0; cv <= v1; cv++) {
          const bucket = grid.get(cu * GRID_AXIS + cv);
          if (!bucket) continue;
          for (const id of bucket) {
            if (
              Math.abs(nuv[2 * id]! - u) <= ARRANGEMENT_SNAP &&
              Math.abs(nuv[2 * id + 1]! - v) <= ARRANGEMENT_SNAP
            ) {
              return id;
            }
          }
        }
      }
      const id = nuv.length / 2;
      nuv.push(u, v);
      xyz.push(x, y, z);
      const key = cell(u) * GRID_AXIS + cell(v);
      const bucket = grid.get(key);
      if (bucket) bucket.push(id);
      else grid.set(key, [id]);
      return id;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Intersections (sweep over segments sorted by min u).

function findSplits(store: VertexStore, segA: number[], segB: number[]): (number[] | undefined)[] {
  const m = segA.length;
  const P = store.nuv;
  const splits: (number[] | undefined)[] = new Array<number[] | undefined>(m);
  const addSplit = (s: number, id: number): void => {
    const list = splits[s];
    if (list) list.push(id);
    else splits[s] = [id];
  };
  const minU = new Float64Array(m);
  const maxU = new Float64Array(m);
  const order: number[] = [];
  for (let s = 0; s < m; s++) {
    const ua = P[2 * segA[s]!]!;
    const ub = P[2 * segB[s]!]!;
    minU[s] = Math.min(ua, ub);
    maxU[s] = Math.max(ua, ub);
    order.push(s);
  }
  order.sort((p, q) => minU[p]! - minU[q]!);

  for (let oi = 0; oi < m; oi++) {
    const i = order[oi]!;
    const a = segA[i]!;
    const b = segB[i]!;
    const ax = P[2 * a]!;
    const ay = P[2 * a + 1]!;
    const rx = P[2 * b]! - ax;
    const ry = P[2 * b + 1]! - ay;
    const lenR = Math.hypot(rx, ry);
    const minVi = Math.min(ay, ay + ry) - ARRANGEMENT_SNAP;
    const maxVi = Math.max(ay, ay + ry) + ARRANGEMENT_SNAP;
    const limit = maxU[i]! + ARRANGEMENT_SNAP;
    for (let oj = oi + 1; oj < m; oj++) {
      const j = order[oj]!;
      if (minU[j]! > limit) break;
      const c = segA[j]!;
      const d = segB[j]!;
      const cx = P[2 * c]!;
      const cy = P[2 * c + 1]!;
      const dy = P[2 * d + 1]!;
      if (Math.max(cy, dy) < minVi || Math.min(cy, dy) > maxVi) continue;
      const sx = P[2 * d]! - cx;
      const sy = dy - cy;
      const lenS = Math.hypot(sx, sy);
      const qx = cx - ax;
      const qy = cy - ay;
      const denom = rx * sy - ry * sx;
      const shared = a === c || a === d || b === c || b === d;

      if (Math.abs(denom) > 1e-12 * lenR * lenS) {
        // Non-parallel: segments sharing an endpoint cannot meet anywhere else.
        if (shared) continue;
        const t = (qx * sy - qy * sx) / denom;
        const u = (qx * ry - qy * rx) / denom;
        const tt = ARRANGEMENT_SNAP / lenR;
        const tu = ARRANGEMENT_SNAP / lenS;
        if (t < -tt || t > 1 + tt || u < -tu || u > 1 + tu) continue;
        const tc = Math.min(1, Math.max(0, t));
        const id = addInterpolated(store, a, b, tc);
        if (id !== a && id !== b) addSplit(i, id);
        if (id !== c && id !== d) addSplit(j, id);
        continue;
      }

      // Parallel: only collinear overlaps matter; split each at the other's interior endpoints.
      if (Math.abs(qx * ry - qy * rx) / lenR > ARRANGEMENT_SNAP) continue;
      splitAtCollinear(P, i, a, rx, ry, lenR, c, addSplit);
      splitAtCollinear(P, i, a, rx, ry, lenR, d, addSplit);
      splitAtCollinear(P, j, c, sx, sy, lenS, a, addSplit);
      splitAtCollinear(P, j, c, sx, sy, lenS, b, addSplit);
    }
  }
  return splits;
}

function splitAtCollinear(
  P: number[],
  seg: number,
  a: number,
  rx: number,
  ry: number,
  len: number,
  p: number,
  addSplit: (s: number, id: number) => void,
): void {
  const t = ((P[2 * p]! - P[2 * a]!) * rx + (P[2 * p + 1]! - P[2 * a + 1]!) * ry) / (len * len);
  const tol = ARRANGEMENT_SNAP / len;
  if (t > tol && t < 1 - tol) addSplit(seg, p);
}

function addInterpolated(store: VertexStore, a: number, b: number, t: number): number {
  const P = store.nuv;
  const X = store.xyz;
  const lerp = (p: number, q: number): number => p + (q - p) * t;
  return store.add(
    lerp(P[2 * a]!, P[2 * b]!),
    lerp(P[2 * a + 1]!, P[2 * b + 1]!),
    lerp(X[3 * a]!, X[3 * b]!),
    lerp(X[3 * a + 1]!, X[3 * b + 1]!),
    lerp(X[3 * a + 2]!, X[3 * b + 2]!),
  );
}

// ---------------------------------------------------------------------------------------------
// Edge accumulation.

function accumulateEdges(
  store: VertexStore,
  segA: number[],
  segB: number[],
  splits: (number[] | undefined)[],
  rule: FillWindingRule,
): { edgeLo: number[]; edgeHi: number[]; weight: number[] } {
  const P = store.nuv;
  const vcount = store.count();
  const net = new Map<number, number>();
  const count = new Map<number, number>();
  const push = (p: number, q: number): void => {
    if (p === q) return;
    const lo = Math.min(p, q);
    const key = lo * vcount + Math.max(p, q);
    net.set(key, (net.get(key) ?? 0) + (p < q ? 1 : -1));
    count.set(key, (count.get(key) ?? 0) + 1);
  };
  for (let s = 0; s < segA.length; s++) {
    const a = segA[s]!;
    const b = segB[s]!;
    const list = splits[s];
    if (!list) {
      push(a, b);
      continue;
    }
    const ax = P[2 * a]!;
    const ay = P[2 * a + 1]!;
    const rx = P[2 * b]! - ax;
    const ry = P[2 * b + 1]! - ay;
    const param = (id: number): number => (P[2 * id]! - ax) * rx + (P[2 * id + 1]! - ay) * ry;
    list.sort((p, q) => param(p) - param(q));
    let prev = a;
    for (const id of list) {
      if (id === prev) continue;
      push(prev, id);
      prev = id;
    }
    push(prev, b);
  }

  const edgeLo: number[] = [];
  const edgeHi: number[] = [];
  const weight: number[] = [];
  for (const [key, w] of net) {
    const c = count.get(key)!;
    // Even-odd only cares about parity; nonzero about the directed sum.
    const keep = rule === 'nonzero' ? w !== 0 : (c & 1) !== 0;
    if (!keep) continue;
    edgeLo.push(Math.floor(key / vcount));
    edgeHi.push(key % vcount);
    weight.push(rule === 'nonzero' ? w : 1);
  }
  return { edgeLo, edgeHi, weight };
}

// ---------------------------------------------------------------------------------------------
// Face tracing.

interface FaceGraph {
  /** Face id of each half-edge; half-edge 2e runs lo→hi of edge e, 2e+1 runs hi→lo. */
  faceOf: Int32Array;
  faceLoops: number[][];
  faceHalfEdges: number[][];
  /** Signed area (normalized units); > 0 for bounded faces. */
  faceArea: number[];
  faceComponent: number[];
  componentCount: number;
  /** Outer (clockwise) face of each component, or -1. */
  componentOuter: number[];
  /** Smallest bounded face of another component containing this component, or -1. */
  container: number[];
}

function traceFaces(store: VertexStore, edgeLo: number[], edgeHi: number[]): FaceGraph {
  const P = store.nuv;
  const vcount = store.count();
  const hcount = edgeLo.length * 2;
  const from = (h: number): number => ((h & 1) === 0 ? edgeLo[h >> 1]! : edgeHi[h >> 1]!);
  const to = (h: number): number => ((h & 1) === 0 ? edgeHi[h >> 1]! : edgeLo[h >> 1]!);

  // Outgoing half-edges per vertex, sorted counter-clockwise by angle.
  const outgoing: number[][] = [];
  for (let v = 0; v < vcount; v++) outgoing.push([]);
  const angle = new Float64Array(hcount);
  for (let h = 0; h < hcount; h++) {
    const a = from(h);
    const b = to(h);
    angle[h] = Math.atan2(P[2 * b + 1]! - P[2 * a + 1]!, P[2 * b]! - P[2 * a]!);
    outgoing[a]!.push(h);
  }
  const slot = new Int32Array(hcount);
  for (const list of outgoing) {
    list.sort((p, q) => angle[p]! - angle[q]!);
    for (let k = 0; k < list.length; k++) slot[list[k]!] = k;
  }
  // next(u→v) = the half-edge leaving v immediately clockwise from v→u: keeps the face on the left.
  const next = (h: number): number => {
    const list = outgoing[to(h)]!;
    const k = slot[h ^ 1]!;
    return list[(k - 1 + list.length) % list.length]!;
  };

  // Connected components over vertices (union-find).
  const parent = new Int32Array(vcount);
  for (let v = 0; v < vcount; v++) parent[v] = v;
  const find = (v: number): number => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]!]!;
      v = parent[v]!;
    }
    return v;
  };
  for (let e = 0; e < edgeLo.length; e++) {
    const ra = find(edgeLo[e]!);
    const rb = find(edgeHi[e]!);
    if (ra !== rb) parent[ra] = rb;
  }

  const faceOf = new Int32Array(hcount).fill(-1);
  const faceLoops: number[][] = [];
  const faceHalfEdges: number[][] = [];
  const faceArea: number[] = [];
  const faceComponent: number[] = [];
  const componentIndex = new Map<number, number>();
  const componentOuter: number[] = [];
  const componentVertex: number[] = [];
  for (let h0 = 0; h0 < hcount; h0++) {
    if (faceOf[h0] !== -1) continue;
    const f = faceLoops.length;
    const loop: number[] = [];
    const hes: number[] = [];
    let area = 0;
    let h = h0;
    for (let guard = 0; guard <= hcount && faceOf[h] === -1; guard++) {
      faceOf[h] = f;
      hes.push(h);
      const a = from(h);
      const b = to(h);
      loop.push(a);
      area += P[2 * a]! * P[2 * b + 1]! - P[2 * b]! * P[2 * a + 1]!;
      h = next(h);
    }
    area /= 2;
    const root = find(from(h0));
    let c = componentIndex.get(root);
    if (c === undefined) {
      c = componentOuter.length;
      componentIndex.set(root, c);
      componentOuter.push(-1);
      componentVertex.push(from(h0));
    }
    faceLoops.push(loop);
    faceHalfEdges.push(hes);
    faceArea.push(area);
    faceComponent.push(c);
    // The outer loop is the (most) negative one; ties/degenerate faces keep the first.
    const current = componentOuter[c]!;
    if (area <= 0 && (current < 0 || area < faceArea[current]!)) componentOuter[c] = f;
  }

  // Nesting: which bounded face of another component contains each component?
  const componentCount = componentOuter.length;
  const bbox: number[] = [];
  for (const loop of faceLoops) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const v of loop) {
      const x = P[2 * v]!;
      const y = P[2 * v + 1]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    bbox.push(x0, y0, x1, y1);
  }
  const container: number[] = [];
  for (let c = 0; c < componentCount; c++) {
    const v = componentVertex[c]!;
    const px = P[2 * v]!;
    const py = P[2 * v + 1]!;
    let best = -1;
    for (let f = 0; f < faceLoops.length; f++) {
      if (faceComponent[f] === c || !(faceArea[f]! > 0)) continue;
      if (
        px < bbox[4 * f]! ||
        px > bbox[4 * f + 2]! ||
        py < bbox[4 * f + 1]! ||
        py > bbox[4 * f + 3]!
      ) {
        continue;
      }
      if (best >= 0 && faceArea[f]! >= faceArea[best]!) continue;
      if (pointInLoop(P, faceLoops[f]!, px, py)) best = f;
    }
    container.push(best);
  }

  return {
    faceOf,
    faceLoops,
    faceHalfEdges,
    faceArea,
    faceComponent,
    componentCount,
    componentOuter,
    container,
  };
}

/** Even-odd crossing test; the point is known not to lie on the loop. */
function pointInLoop(P: number[], loop: number[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = P[2 * loop[i]!]!;
    const yi = P[2 * loop[i]! + 1]!;
    const xj = P[2 * loop[j]!]!;
    const yj = P[2 * loop[j]! + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------------------------
// Windings.

function computeWindings(graph: FaceGraph, weight: number[]): number[] {
  const faceCount = graph.faceLoops.length;
  // Winding relative to the component's outer face.
  const rel = new Array<number>(faceCount).fill(0);
  const seen = new Uint8Array(faceCount);
  for (let c = 0; c < graph.componentCount; c++) {
    const outer = graph.componentOuter[c]!;
    if (outer < 0) continue;
    seen[outer] = 1;
    const queue = [outer];
    while (queue.length > 0) {
      const f = queue.pop()!;
      for (const h of graph.faceHalfEdges[f]!) {
        const g = graph.faceOf[h ^ 1]!;
        if (seen[g]) continue;
        seen[g] = 1;
        // Left of lo→hi (half-edge 2e) = right + w.
        const w = weight[h >> 1]!;
        rel[g] = (h & 1) === 0 ? rel[f]! - w : rel[f]! + w;
        queue.push(g);
      }
    }
  }
  // Absolute: the outside of a component has the winding of its containing face.
  const base = new Array<number | undefined>(graph.componentCount).fill(undefined);
  const resolve = (c: number, depth: number): number => {
    const known = base[c];
    if (known !== undefined) return known;
    const container = graph.container[c]!;
    // Depth guard: nesting is acyclic by construction; the guard only protects against NaN input.
    const value =
      container < 0 || depth > graph.componentCount
        ? 0
        : resolve(graph.faceComponent[container]!, depth + 1) + rel[container]!;
    base[c] = value;
    return value;
  };
  const winding = new Array<number>(faceCount);
  for (let f = 0; f < faceCount; f++) winding[f] = resolve(graph.faceComponent[f]!, 0) + rel[f]!;
  return winding;
}

// ---------------------------------------------------------------------------------------------

function triangulateLoops(
  store: VertexStore,
  loop: number[],
  holes: number[][],
  out: number[],
): void {
  const P = store.nuv;
  const ids: number[] = [];
  const coords: number[] = [];
  const holeIndices: number[] = [];
  const append = (ring: number[]): void => {
    for (const v of ring) {
      ids.push(v);
      coords.push(P[2 * v]!, P[2 * v + 1]!);
    }
  };
  append(loop);
  for (const hole of holes) {
    holeIndices.push(ids.length);
    append(hole);
  }
  const tris = earcut(coords, holeIndices.length > 0 ? holeIndices : null, 2);
  for (const t of tris) out.push(ids[t]!);
}
