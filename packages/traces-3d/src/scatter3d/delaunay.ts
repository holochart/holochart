/**
 * 2D Delaunay triangulation for `scatter3d`'s `surfaceaxis` fill. plotly.js (`scatter3d/convert.js`
 * `constructDelaunay`) projects the points onto the plane of the two other axes, drops the
 * non-finite ones and triangulates the rest with the `delaunay-triangulate` package, mapping the
 * cells back to input indices; this module does the same without a dependency.
 *
 * The algorithm is a port of Delaunator (Mapbox, ISC): a radial sweep. Points are sorted by
 * distance from the circumcenter of a seed triangle near the bounding-box center and added one by
 * one outside the convex hull, found through an angular hash of hull vertices; each new fan is
 * made Delaunay by recursive edge flips on a half-edge structure. Expected O(n log n): 100k random
 * points take ~0.1 s.
 *
 * Robustness:
 * - Coordinates are only scaled, by a power of two (exact), to about unit size. They are not
 *   translated (that would round): large offsets with small spans (dates in ms, ~1.7e12) keep
 *   full precision, as every predicate works on differences of nearby coordinates, which are
 *   exact. The scale is uniform: the result is the Delaunay triangulation in the input's own
 *   (u, v) metric, as plotly.js's.
 * - Orientation is Shewchuk's filtered `orient2d` with an exact fallback (an expansion sum of the
 *   six coordinate products): hull walks and triangle orientation never see a wrong sign, so no
 *   triangle is folded or flat. The in-circle test is plain float64 (as Delaunator's); a flip is
 *   also refused unless both new triangles are properly oriented, so its rounding can at worst
 *   cost Delaunay-ness among nearly co-circular points.
 * - The sweep order uses double-double distances, and points the sweep still cannot place (float
 *   ties on very thin sets, a point on the seed triangle's edge — Delaunator drops these) are
 *   inserted afterwards by Lawson's algorithm (locate, split, flip).
 * - Only exact duplicates are dropped (no epsilon): equal sort keys are ordered by index, so each
 *   point is triangulated once, as its first occurrence.
 */

/** Triangles of fewer than 3 points, or of collinear points. */
const NO_TRIANGLES = new Uint32Array(0);

/** Shewchuk's error bound for the float `orient2d` determinant. */
const CCW_ERR_BOUND = (3 + 16 * 2 ** -53) * 2 ** -53;

/** Veltkamp splitter for exact products (2^27 + 1). */
const SPLITTER = 134217729;

/**
 * Delaunay triangles of the finite points (u[i], v[i]), i < count (default min length): a flat
 * Uint32Array of input indices, 3 per triangle, counter-clockwise. Non-finite points are skipped;
 * duplicate points are triangulated once (the first); fewer than 3 distinct points or all
 * collinear → empty.
 */
export function delaunayTriangles(
  u: ArrayLike<number>,
  v: ArrayLike<number>,
  count?: number,
): Uint32Array {
  const len = Math.max(0, Math.min(count ?? Infinity, u.length, v.length));

  // Finite points and their bounding box.
  const index = new Uint32Array(len);
  let n = 0;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < len; i++) {
    const x = u[i]!;
    const y = v[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    index[n++] = i;
    if (x < minU) minU = x;
    if (x > maxU) maxU = x;
    if (y < minV) minV = y;
    if (y > maxV) maxV = y;
  }
  if (n < 3) return NO_TRIANGLES;

  // Scale by a power of two (exact) so the largest |coordinate| is about 1: squared distances
  // neither overflow nor underflow. No translation: it would round, merging points one ulp apart
  // and bending near-collinear triples; the predicates work on coordinate differences, exact for
  // nearby values whatever their offset.
  const maxAbs = Math.max(-minU, maxU, -minV, maxV);
  if (maxU === minU && maxV === minV) return NO_TRIANGLES;
  const scale = maxAbs > 0 ? 2 ** -Math.ceil(Math.log2(maxAbs)) : 1;
  const coords = new Float64Array(2 * n);
  for (let k = 0; k < n; k++) {
    const i = index[k]!;
    coords[2 * k] = u[i]! * scale;
    coords[2 * k + 1] = v[i]! * scale;
  }

  const tri = triangulate(coords, n, (minU / 2 + maxU / 2) * scale, (minV / 2 + maxV / 2) * scale);
  // Delaunator's triangles are clockwise with y up: swap two corners to make them CCW.
  const out = new Uint32Array(tri.length);
  for (let t = 0; t < tri.length; t += 3) {
    out[t] = index[tri[t]!]!;
    out[t + 1] = index[tri[t + 2]!]!;
    out[t + 2] = index[tri[t + 1]!]!;
  }
  return out;
}

/**
 * Delaunator's sweep over `n` points (`coords` interleaved x, y, at most about unit size, finite;
 * (cx, cy) their bounding-box center): triangles as point indices, clockwise with y up
 * (`orient > 0`).
 */
function triangulate(coords: Float64Array, n: number, cx: number, cy: number): Uint32Array {
  const maxTriangles = Math.max(2 * n - 5, 0);
  const triangles = new Uint32Array(maxTriangles * 3);
  const halfedges = new Int32Array(maxTriangles * 3);
  const hashSize = Math.ceil(Math.sqrt(n));
  const hullPrev = new Uint32Array(n);
  const hullNext = new Uint32Array(n);
  const hullTri = new Uint32Array(n);
  const hullHash = new Int32Array(hashSize).fill(-1);
  const ids = new Uint32Array(n);
  const dists = new Float64Array(n);
  const distsLo = new Float64Array(n);
  let edgeStack = new Uint32Array(512);
  let trianglesLen = 0;
  let hullStart = 0;

  const x = (i: number): number => coords[2 * i]!;
  const y = (i: number): number => coords[2 * i + 1]!;

  // Seed triangle: the point nearest the box center, its nearest neighbour, and the
  // point making the smallest circumcircle with them that is not collinear with them.
  let i0 = 0;
  let minDist = Infinity;
  for (let i = 0; i < n; i++) {
    ids[i] = i;
    const d = dist(cx, cy, x(i), y(i));
    if (d < minDist) {
      i0 = i;
      minDist = d;
    }
  }
  const i0x = x(i0);
  const i0y = y(i0);
  let i1 = -1;
  minDist = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === i0) continue;
    const d = dist(i0x, i0y, x(i), y(i));
    if (d < minDist && d > 0) {
      i1 = i;
      minDist = d;
    }
  }
  if (i1 < 0) return NO_TRIANGLES;
  let i1x = x(i1);
  let i1y = y(i1);
  let i2 = -1;
  let minRadius = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    const r = circumradius(i0x, i0y, i1x, i1y, x(i), y(i));
    if (r < minRadius && orient(i0x, i0y, i1x, i1y, x(i), y(i)) !== 0) {
      i2 = i;
      minRadius = r;
    }
  }
  if (i2 < 0) {
    // circumradius overflowed on a thin but non-degenerate set: take any non-collinear point.
    for (let i = 0; i < n && i2 < 0; i++) {
      if (i !== i0 && i !== i1 && orient(i0x, i0y, i1x, i1y, x(i), y(i)) !== 0) i2 = i;
    }
    if (i2 < 0) return NO_TRIANGLES; // all collinear
  }
  let i2x = x(i2);
  let i2y = y(i2);
  if (orient(i0x, i0y, i1x, i1y, i2x, i2y) < 0) {
    const i = i1;
    i1 = i2;
    i2 = i;
    [i1x, i2x] = [i2x, i1x];
    [i1y, i2y] = [i2y, i1y];
  }

  let [ccx, ccy] = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
  if (!Number.isFinite(ccx) || !Number.isFinite(ccy)) {
    // A seed too thin for float64: any center gives a valid order, as missed points are
    // inserted after the sweep.
    ccx = (i0x + i1x + i2x) / 3;
    ccy = (i0y + i1y + i2y) / 3;
  }
  // Sweep order: by squared distance from the seed circumcenter in double-double precision (the
  // sweep needs each point outside the hull so far; float64 ties on thin sets break that), then
  // by index (exact duplicates in input order: the first copy wins).
  for (let i = 0; i < n; i++) dists[i] = distDD(x(i), y(i), ccx, ccy, distsLo, i);
  quicksort(ids, dists, 0, n - 1);
  const byLoThenIndex = (a: number, b: number): number => distsLo[a]! - distsLo[b]! || a - b;
  for (let k = 1, run = 0; k <= n; k++) {
    if (k < n && dists[ids[k]!] === dists[ids[run]!]) continue;
    if (k - run > 1) ids.subarray(run, k).sort(byLoThenIndex);
    run = k;
  }

  const hashKey = (px: number, py: number): number =>
    Math.floor(pseudoAngle(px - ccx, py - ccy) * hashSize) % hashSize || 0; // NaN at the center

  const link = (a: number, b: number): void => {
    halfedges[a] = b;
    if (b !== -1) halfedges[b] = a;
  };

  const addTriangle = (
    a0: number,
    a1: number,
    a2: number,
    ha: number,
    hb: number,
    hc: number,
  ): number => {
    const t = trianglesLen;
    triangles[t] = a0;
    triangles[t + 1] = a1;
    triangles[t + 2] = a2;
    link(t, ha);
    link(t + 1, hb);
    link(t + 2, hc);
    trianglesLen += 3;
    return t;
  };

  // Flip edge `a` and its successors until they are locally Delaunay (recursion on a stack).
  const legalize = (start: number): number => {
    let a = start;
    let sp = 0;
    let ar: number;
    for (;;) {
      const b = halfedges[a]!;
      //           pl                    pl
      //          /||\                  /  \
      //       al/ || \bl            al/    \a
      //        /  ||  \              /      \
      //       /  a||b  \    flip    /___ar___\
      //     p0\   ||   /p1   =>   p0\---bl---/p1
      //        \  ||  /              \      /
      //       ar\ || /br             b\    /br
      //          \||/                  \  /
      //           pr                    pr
      const a0 = a - (a % 3);
      ar = a0 + ((a + 2) % 3);
      if (b === -1) {
        if (sp === 0) break;
        a = edgeStack[--sp]!;
        continue;
      }
      const b0 = b - (b % 3);
      const al = a0 + ((a + 1) % 3);
      const bl = b0 + ((b + 2) % 3);
      const p0 = triangles[ar]!;
      const pr = triangles[a]!;
      const pl = triangles[al]!;
      const p1 = triangles[bl]!;
      const illegal =
        inCircle(x(p0), y(p0), x(pr), y(pr), x(pl), y(pl), x(p1), y(p1)) &&
        orient(x(p1), y(p1), x(pl), y(pl), x(p0), y(p0)) > 0 &&
        orient(x(p0), y(p0), x(pr), y(pr), x(p1), y(p1)) > 0;
      if (illegal) {
        triangles[a] = p1;
        triangles[b] = p0;
        const hbl = halfedges[bl]!;
        // The edge was swapped on the other side of the hull (rare): fix the hull's reference.
        if (hbl === -1) {
          let e = hullStart;
          do {
            if (hullTri[e] === bl) {
              hullTri[e] = a;
              break;
            }
            e = hullPrev[e]!;
          } while (e !== hullStart);
        }
        link(a, hbl);
        link(b, halfedges[ar]!);
        link(ar, bl);
        const br = b0 + ((b + 1) % 3);
        if (sp === edgeStack.length) {
          const grown = new Uint32Array(sp * 2);
          grown.set(edgeStack);
          edgeStack = grown;
        }
        edgeStack[sp++] = br;
      } else {
        if (sp === 0) break;
        a = edgeStack[--sp]!;
      }
    }
    return ar;
  };

  // The seed triangle is the starting hull.
  hullStart = i0;
  hullNext[i0] = hullPrev[i2] = i1;
  hullNext[i1] = hullPrev[i0] = i2;
  hullNext[i2] = hullPrev[i1] = i0;
  hullTri[i0] = 0;
  hullTri[i1] = 1;
  hullTri[i2] = 2;
  hullHash[hashKey(i0x, i0y)] = i0;
  hullHash[hashKey(i1x, i1y)] = i1;
  hullHash[hashKey(i2x, i2y)] = i2;
  addTriangle(i0, i1, i2, -1, -1, -1);

  const missed: number[] = [];
  let xp = 0;
  let yp = 0;
  for (let k = 0; k < n; k++) {
    const i = ids[k]!;
    const px = x(i);
    const py = y(i);
    // A duplicate of the previous point (exact predicates make near-duplicates harmless).
    if (k > 0 && px === xp && py === yp) continue;
    xp = px;
    yp = py;
    if (i === i0 || i === i1 || i === i2) continue;

    // A hull edge visible from the point, starting from the hash.
    let start = 0;
    for (let j = 0, key = hashKey(px, py); j < hashSize; j++) {
      start = hullHash[(key + j) % hashSize]!;
      if (start !== -1 && start !== hullNext[start]) break;
    }
    start = hullPrev[start]!;
    let e = start;
    let q = hullNext[e]!;
    while (orient(px, py, x(e), y(e), x(q), y(q)) >= 0) {
      e = q;
      if (e === start) {
        e = -1;
        break;
      }
      q = hullNext[e]!;
    }
    if (e === -1) {
      // On or inside the hull: a duplicate, or a point the sweep order missed (float ties on
      // thin sets, a point on the seed triangle's edge). Inserted afterwards.
      missed.push(i);
      continue;
    }

    // The first triangle from the point, then walk forward and backward along the visible hull.
    let t = addTriangle(e, i, hullNext[e]!, -1, -1, hullTri[e]!);
    hullTri[i] = legalize(t + 2);
    hullTri[e] = t;

    let next = hullNext[e]!;
    q = hullNext[next]!;
    while (orient(px, py, x(next), y(next), x(q), y(q)) < 0) {
      t = addTriangle(next, i, q, hullTri[i]!, -1, hullTri[next]!);
      hullTri[i] = legalize(t + 2);
      hullNext[next] = next; // removed from the hull
      next = q;
      q = hullNext[next]!;
    }
    if (e === start) {
      q = hullPrev[e]!;
      while (orient(px, py, x(q), y(q), x(e), y(e)) < 0) {
        t = addTriangle(q, i, e, -1, hullTri[e]!, hullTri[q]!);
        legalize(t + 2);
        hullTri[q] = t;
        hullNext[e] = e; // removed from the hull
        e = q;
        q = hullPrev[e]!;
      }
    }

    hullStart = hullPrev[i] = e;
    hullNext[e] = hullPrev[next] = i;
    hullNext[i] = next;
    hullHash[hashKey(px, py)] = i;
    hullHash[hashKey(x(e), y(e))] = e;
  }

  // Lawson insertion of the missed points: find the triangle holding the point (a visibility
  // walk, or a scan if the walk cycles), split it (1 → 3), or split the edge the point lies on
  // (2 → 4, or 1 → 2 on the hull), and legalize the edges opposite the point. Duplicates of a
  // vertex are dropped.
  let walkFrom = 0;
  const holds = (t: number, px: number, py: number): boolean => {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k]!;
      const b = triangles[t + ((k + 1) % 3)]!;
      if (orient(x(a), y(a), x(b), y(b), px, py) < 0) return false;
    }
    return true;
  };
  for (const p of missed) {
    const px = x(p);
    const py = y(p);
    let t = walkFrom;
    let steps = 0;
    walk: for (;;) {
      if (++steps > trianglesLen) {
        t = -1;
        for (let s = 0; s < trianglesLen && t < 0; s += 3) if (holds(s, px, py)) t = s;
        break;
      }
      for (let k = 0; k < 3; k++) {
        const a = triangles[t + k]!;
        const b = triangles[t + ((k + 1) % 3)]!;
        if (orient(x(a), y(a), x(b), y(b), px, py) < 0) {
          const twin = halfedges[t + k]!;
          if (twin === -1) {
            t = -1; // outside the hull (the sweep keeps missed points inside it)
            break walk;
          }
          t = twin - (twin % 3);
          continue walk;
        }
      }
      break;
    }
    if (t < 0) continue;
    walkFrom = t;

    let onEdge = -1;
    let zeros = 0;
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k]!;
      const b = triangles[t + ((k + 1) % 3)]!;
      if (orient(x(a), y(a), x(b), y(b), px, py) === 0) {
        onEdge = t + k;
        zeros++;
      }
    }
    if (zeros > 1) continue; // a vertex: duplicate

    if (zeros === 0) {
      // (v0, v1, v2) → (v0, v1, p), (v1, v2, p), (v2, v0, p); the first reuses t's slots.
      const s1 = t + 1;
      const s2 = t + 2;
      const v1 = triangles[s1]!;
      const v2 = triangles[s2]!;
      const h1 = halfedges[s1]!;
      const h2 = halfedges[s2]!;
      triangles[s2] = p;
      const t1 = addTriangle(v1, v2, p, h1, -1, s1);
      const t2 = addTriangle(v2, triangles[t]!, p, h2, s2, t1 + 1);
      if (h1 === -1) hullTri[v1] = t1;
      if (h2 === -1) hullTri[v2] = t2;
      legalize(t);
      legalize(t1);
      legalize(t2);
      continue;
    }

    // p on the edge s0 = v0 → v1 of (v0, v1, v2): (v0, p, v2) in t's slots, plus (p, v1, v2).
    const s0 = onEdge;
    const s1 = t + ((s0 - t + 1) % 3);
    const s2 = t + ((s0 - t + 2) % 3);
    const v0 = triangles[s0]!;
    const v1 = triangles[s1]!;
    const v2 = triangles[s2]!;
    const h1 = halfedges[s1]!;
    const b = halfedges[s0]!;
    triangles[s1] = p;
    const t1 = addTriangle(p, v1, v2, -1, h1, s1);
    if (h1 === -1) hullTri[v1] = t1 + 1;
    if (b === -1) {
      // A hull edge: p joins the hull between v0 and v1.
      hullNext[v0] = p;
      hullPrev[p] = v0;
      hullNext[p] = v1;
      hullPrev[v1] = p;
      hullTri[p] = t1;
      legalize(s2);
      hullTri[p] = legalize(t1 + 1);
      continue;
    }
    // An interior edge: its twin (v1, v0, w) splits too, into (v1, p, w) in its slots and
    // (p, v0, w).
    const u = b - (b % 3);
    const b1 = u + ((b - u + 1) % 3);
    const b2 = u + ((b - u + 2) % 3);
    const w = triangles[b2]!;
    const hb1 = halfedges[b1]!;
    triangles[b1] = p;
    link(b, t1);
    const t2 = addTriangle(p, v0, w, s0, hb1, b1);
    if (hb1 === -1) hullTri[v0] = t2 + 1;
    legalize(s2);
    legalize(t1 + 1);
    legalize(b2);
    legalize(t2 + 1);
  }

  return triangles.subarray(0, trianglesLen);
}

/**
 * Orientation of (a, b, c): positive when clockwise with y up, negative when counter-clockwise,
 * 0 when collinear (robust-predicates' `orient2d` sign convention, as Delaunator uses it). Exact.
 */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const detLeft = (ay - cy) * (bx - cx);
  const detRight = (ax - cx) * (by - cy);
  const det = detLeft - detRight;
  if (Math.abs(det) >= CCW_ERR_BOUND * Math.abs(detLeft + detRight)) return det;
  return orientExact(ax, ay, bx, by, cx, cy);
}

const expansion = new Float64Array(12);

/** Sign of `ay·bx − ay·cx − cy·bx − ax·by + ax·cy + cx·by` in exact arithmetic. */
function orientExact(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  let len = 0;
  len = growProduct(len, ay, bx);
  len = growProduct(len, -ay, cx);
  len = growProduct(len, -cy, bx);
  len = growProduct(len, -ax, by);
  len = growProduct(len, ax, cy);
  len = growProduct(len, cx, by);
  return len === 0 ? 0 : Math.sign(expansion[len - 1]!);
}

/** Adds the exact product a·b to the expansion (Dekker's two-product, Shewchuk's grow). */
function growProduct(len: number, a: number, b: number): number {
  const p = a * b;
  let c = SPLITTER * a;
  const aHi = c - (c - a);
  const aLo = a - aHi;
  c = SPLITTER * b;
  const bHi = c - (c - b);
  const bLo = b - bHi;
  const err = aLo * bLo - (p - aHi * bHi - aLo * bHi - aHi * bLo);
  return grow(grow(len, err), p);
}

/** Shewchuk's `grow_expansion_zeroelim`, in place (the output never overtakes the input). */
function grow(len: number, b: number): number {
  let q = b;
  let out = 0;
  for (let i = 0; i < len; i++) {
    const e = expansion[i]!;
    const sum = q + e;
    const bv = sum - q;
    const h = q - (sum - bv) + (e - bv);
    q = sum;
    if (h !== 0) expansion[out++] = h;
  }
  if (q !== 0 || out === 0) expansion[out++] = q;
  return out === 1 && expansion[0] === 0 ? 0 : out;
}

/** p inside the circumcircle of the clockwise (y up) triangle a, b, c (float64). */
function inCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  px: number,
  py: number,
): boolean {
  const dx = ax - px;
  const dy = ay - py;
  const ex = bx - px;
  const ey = by - py;
  const fx = cx - px;
  const fy = cy - py;
  const ap = dx * dx + dy * dy;
  const bp = ex * ex + ey * ey;
  const cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Squared distance between (px, py) and (cx, cy) as a normalized double-double (error ~2^-100
 * relative): returns the high part and stores the low part in `lo[i]`.
 */
function distDD(
  px: number,
  py: number,
  cx: number,
  cy: number,
  lo: Float64Array,
  i: number,
): number {
  // dx + dxLo = px − cx exactly (two-diff); dx² = xx + xxErr exactly (two-square).
  const dx = px - cx;
  let bv = px - dx;
  const dxLo = px - (dx + bv) + (bv - cx);
  const xx = dx * dx;
  let c = SPLITTER * dx;
  let hi = c - (c - dx);
  let lw = dx - hi;
  const xxErr = lw * lw - (xx - hi * hi - 2 * hi * lw);
  const dy = py - cy;
  bv = py - dy;
  const dyLo = py - (dy + bv) + (bv - cy);
  const yy = dy * dy;
  c = SPLITTER * dy;
  hi = c - (c - dy);
  lw = dy - hi;
  const yyErr = lw * lw - (yy - hi * hi - 2 * hi * lw);
  // xx + yy = sum + sumErr exactly (two-sum), plus the small terms (dLo² dropped).
  const sum = xx + yy;
  bv = sum - xx;
  const sumErr = xx - (sum - bv) + (yy - bv);
  const low = sumErr + xxErr + yyErr + 2 * dx * dxLo + 2 * dy * dyLo;
  const key = sum + low;
  lo[i] = low - (key - sum);
  return key;
}

/** Squared circumradius (Infinity or NaN when collinear). */
function circumradius(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const x = (ey * bl - dy * cl) * d;
  const y = (dx * cl - ex * bl) * d;
  return x * x + y * y;
}

function circumcenter(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  return [ax + (ey * bl - dy * cl) * d, ay + (dx * cl - ex * bl) * d];
}

/** Monotone key in [0, 1) of the angle of (dx, dy), for the hull hash. */
function pseudoAngle(dx: number, dy: number): number {
  const p = dx / (Math.abs(dx) + Math.abs(dy));
  return (dy > 0 ? 3 - p : 1 + p) / 4;
}

/** Sorts `ids[left..right]` by `dists[id]` (median-of-three quicksort, insertion for small runs). */
function quicksort(ids: Uint32Array, dists: Float64Array, left: number, right: number): void {
  if (right - left <= 20) {
    for (let i = left + 1; i <= right; i++) {
      const temp = ids[i]!;
      const tempDist = dists[temp]!;
      let j = i - 1;
      while (j >= left && dists[ids[j]!]! > tempDist) {
        ids[j + 1] = ids[j]!;
        j--;
      }
      ids[j + 1] = temp;
    }
    return;
  }
  const median = (left + right) >> 1;
  let i = left + 1;
  let j = right;
  swap(ids, median, i);
  if (dists[ids[left]!]! > dists[ids[right]!]!) swap(ids, left, right);
  if (dists[ids[i]!]! > dists[ids[right]!]!) swap(ids, i, right);
  if (dists[ids[left]!]! > dists[ids[i]!]!) swap(ids, left, i);
  const temp = ids[i]!;
  const tempDist = dists[temp]!;
  for (;;) {
    do i++;
    while (dists[ids[i]!]! < tempDist);
    do j--;
    while (dists[ids[j]!]! > tempDist);
    if (j < i) break;
    swap(ids, i, j);
  }
  ids[left + 1] = ids[j]!;
  ids[j] = temp;
  if (right - i + 1 >= j - left) {
    quicksort(ids, dists, i, right);
    quicksort(ids, dists, left, j - 1);
  } else {
    quicksort(ids, dists, left, j - 1);
    quicksort(ids, dists, i, right);
  }
}

function swap(arr: Uint32Array, i: number, j: number): void {
  const tmp = arr[i]!;
  arr[i] = arr[j]!;
  arr[j] = tmp;
}
