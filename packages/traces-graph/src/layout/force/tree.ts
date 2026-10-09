/**
 * The Barnes–Hut tree of the force layout: a quadtree in two dimensions, an octree in three, built
 * anew each tick on flat typed arrays (no object per node or per cell, ADR-029).
 *
 * How it is laid out:
 * - Points are sorted into **tree order** (a depth-first walk), so every cell covers one run of
 *   slots `first … end − 1` and a leaf reads its points from consecutive memory. `order[slot]` is
 *   the node index; `points` holds the nodes' coordinates and masses in that order.
 * - Cells are stored in the same depth-first order: a cell's first child is the next cell, and its
 *   `skip` is the cell after its whole subtree. A walk needs no stack: go to `c + 1` to open a
 *   cell, to its `skip` to pass over it. A leaf is a cell whose `skip` is `c + 1`.
 * - A leaf holds up to `leafSize` points (more only when points coincide to within the depth
 *   limit), summed one by one. A cell whose points all fall in one child is not stored: its box
 *   shrinks to that child and splitting goes on, so every stored cell has at least two children and
 *   there are fewer than `2 × points` cells.
 * - A cell's numbers sit side by side (`cells`, `links`, `boxes`: one record per cell), not in one
 *   array per property: a walk reads several of them per cell, and this way they share a cache
 *   line. Measured on 10,000 nodes, the far-field sum is a quarter faster for it.
 *
 * Two queries run on it: {@link BarnesHutTree.accumulate}, the far-field sum behind many-body
 * repulsion (d3-force's and ForceAtlas2's alike), and {@link BarnesHutTree.separate}, collision
 * between nodes, which reads each cell's box and largest radius.
 *
 * The record offsets below are deliberately not exported, and the queries are methods here rather
 * than functions in other files: an exported `const` is read through a module binding each time
 * unless a bundler has merged the modules, and in these loops that cost a quarter of the time in
 * 2D and more than a third in 3D (Node 26, unbundled sources).
 */
import type { Lcg } from './math.ts';

/** Below this box size (root size / 2^MAX_DEPTH) points share a leaf whatever their number. */
const MAX_DEPTH = 40;

/**
 * Record size and field offsets of `points`. The sizes are powers of two and the queries shift by
 * them (`slot << 2`, `cell << 3`) where the build multiplies: a shift needs no overflow check.
 */
const POINT = 4;
const P_X = 0;
const P_Y = 1;
const P_Z = 2;
const P_MASS = 3;
/** … of `cells`: center of mass, summed mass, squared width, summed `|mass|`. */
const CELL = 8;
const C_X = 0;
const C_Y = 1;
const C_Z = 2;
const C_MASS = 3;
const C_WIDTH2 = 4;
const C_ABS = 5;
/** … of `links`. */
const LINK = 4;
const L_SKIP = 0;
const L_FIRST = 1;
const L_END = 2;
const L_PARENT = 3;
/** … of `boxes`. */
const BOX = 4;
const B_X = 0;
const B_Y = 1;
const B_Z = 2;
const B_REACH = 3;

export class BarnesHutTree {
  /** `true` for an octree; a quadtree reads no `z`. */
  readonly three: boolean;
  private readonly leafSize: number;
  private capacity = 0;

  /** Number of points and of cells of the last {@link build}. */
  size = 0;
  count = 0;

  /** Tree slot → node index. */
  private order = new Int32Array(0);
  private scratch = new Int32Array(0);
  private codes = new Uint8Array(0);
  private readonly starts = new Int32Array((MAX_DEPTH + 2) * 9);

  /** Per slot: `x, y, z, mass` (`z` is 0 in a quadtree). */
  private points = new Float64Array(0);
  /** Per slot: the point's radius (0 when built without radii). */
  private radii = new Float64Array(0);
  /** Per cell: center of mass (weighted by `|mass|`), summed signed mass, squared box width. */
  private cells = new Float64Array(0);
  /** Per cell: `skip, first, end, parent`. */
  private links = new Int32Array(0);
  /**
   * Per cell: the center of a box that holds all of its points, and how far from that center, along
   * any axis, the outline of one of its points can reach: half the box plus the largest radius.
   */
  private boxes = new Float64Array(0);
  /** Per cell: the largest radius among its points. */
  private largest = new Float64Array(0);

  // The arrays being built from; only set during `build`.
  private sx: Float64Array = this.points;
  private sy: Float64Array = this.points;
  private sz: Float64Array = this.points;
  private sm: Float64Array | null = null;
  private sr: Float64Array | null = null;

  /** @param leafSize Points a leaf may hold before it is split. Default 8. */
  constructor(dimensions: 2 | 3, leafSize = 8) {
    this.three = dimensions === 3;
    this.leafSize = Math.max(1, Math.floor(leafSize));
  }

  private reserve(n: number): void {
    if (n <= this.capacity) return;
    const cap = Math.max(n, Math.ceil(this.capacity * 1.5), 16);
    this.capacity = cap;
    this.order = new Int32Array(cap);
    this.scratch = new Int32Array(cap);
    this.codes = new Uint8Array(cap);
    this.points = new Float64Array(cap * POINT);
    this.radii = new Float64Array(cap);
    this.cells = new Float64Array(2 * cap * CELL);
    this.links = new Int32Array(2 * cap * LINK);
    this.boxes = new Float64Array(2 * cap * BOX);
    this.largest = new Float64Array(2 * cap);
  }

  /**
   * Build the tree over the first `n` entries of the coordinate arrays (`z` is not read by a
   * quadtree). `mass` may be signed (a d3 charge): a cell's mass is the sum, its center the mean
   * weighted by `|mass|`. Without `mass` no centers are computed; without `radius` no radii.
   */
  build(
    n: number,
    x: Float64Array,
    y: Float64Array,
    z: Float64Array,
    mass: Float64Array | null,
    radius: Float64Array | null,
  ): void {
    this.reserve(n);
    this.size = n;
    this.count = 0;
    if (n === 0) return;
    const { order, three } = this;
    this.sx = x;
    this.sy = y;
    this.sz = z;
    this.sm = mass;
    this.sr = radius;

    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      order[i] = i;
      const xi = x[i]!;
      const yi = y[i]!;
      if (xi < x0) x0 = xi;
      if (xi > x1) x1 = xi;
      if (yi < y0) y0 = yi;
      if (yi > y1) y1 = yi;
      if (three) {
        const zi = z[i]!;
        if (zi < z0) z0 = zi;
        if (zi > z1) z1 = zi;
      }
    }
    if (!three) z0 = z1 = 0;
    const half = Math.max(x1 - x0, y1 - y0, z1 - z0) / 2;
    this.split(order, this.scratch, 0, n, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, half, 0, -1);

    // Sums run up the tree: a child always comes after its parent, so going backwards every
    // cell is complete when it is added to its parent.
    const { cells, links, boxes } = this;
    const count = this.count;
    if (mass) {
      for (let c = count - 1; c > 0; c--) {
        const o = c * CELL;
        const p = links[c * LINK + L_PARENT]! * CELL;
        cells[p + C_X]! += cells[o + C_X]!;
        cells[p + C_Y]! += cells[o + C_Y]!;
        cells[p + C_Z]! += cells[o + C_Z]!;
        cells[p + C_MASS]! += cells[o + C_MASS]!;
        cells[p + C_ABS]! += cells[o + C_ABS]!;
      }
      for (let c = 0; c < count; c++) {
        const o = c * CELL;
        const w = cells[o + C_ABS]!;
        if (w > 0) {
          cells[o + C_X]! /= w;
          cells[o + C_Y]! /= w;
          cells[o + C_Z]! /= w;
        } else {
          cells[o + C_X] = boxes[c * BOX + B_X]!;
          cells[o + C_Y] = boxes[c * BOX + B_Y]!;
          cells[o + C_Z] = boxes[c * BOX + B_Z]!;
        }
      }
    }
    if (radius) {
      const largest = this.largest;
      for (let c = count - 1; c > 0; c--) {
        const p = links[c * LINK + L_PARENT]!;
        if (largest[c]! > largest[p]!) largest[p] = largest[c]!;
      }
      for (let c = 0; c < count; c++) boxes[c * BOX + B_REACH]! += largest[c]!;
    }

    const { points, radii } = this;
    for (let s = 0; s < n; s++) {
      const i = order[s]!;
      const o = s * POINT;
      points[o + P_X] = x[i]!;
      points[o + P_Y] = y[i]!;
      points[o + P_Z] = three ? z[i]! : 0;
      points[o + P_MASS] = mass ? mass[i]! : 0;
      radii[s] = radius ? radius[i]! : 0;
    }
  }

  /**
   * Store the cell of slots `lo … hi − 1`, which lie in the box around (`bx`, `by`, `bz`). The
   * run is read from `from`; `to` is the other of the two slot buffers, to sort into.
   */
  private split(
    from: Int32Array,
    to: Int32Array,
    lo: number,
    hi: number,
    bx: number,
    by: number,
    bz: number,
    half: number,
    depth: number,
    parent: number,
  ): void {
    const { starts, codes, three, links, boxes, cells } = this;
    const x = this.sx;
    const y = this.sy;
    const z = this.sz;
    const size = hi - lo;

    while (size > this.leafSize && depth < MAX_DEPTH) {
      const base = depth * 9;
      for (let q = 0; q < 9; q++) starts[base + q] = 0;
      for (let k = lo; k < hi; k++) {
        const i = from[k]!;
        let q = (x[i]! >= bx ? 1 : 0) | (y[i]! >= by ? 2 : 0);
        if (three && z[i]! >= bz) q |= 4;
        codes[k] = q;
        starts[base + q + 1]!++;
      }
      // All in one child: shrink the box to that child and split again, storing nothing.
      let only = -1;
      for (let q = 0; q < 8; q++) {
        if (starts[base + q + 1] === size) only = q;
      }
      half /= 2;
      depth++;
      if (only >= 0) {
        bx += only & 1 ? half : -half;
        by += only & 2 ? half : -half;
        if (three) bz += only & 4 ? half : -half;
        continue;
      }

      // A stable counting sort of the run by child, into the other buffer, so the order never
      // depends on anything but the input.
      for (let q = 0; q < 8; q++) starts[base + q + 1]! += starts[base + q]!;
      for (let k = lo; k < hi; k++) to[lo + starts[base + codes[k]!]!++] = from[k]!;
      // `starts[q]` is now the end of child `q`, so child `q` runs from `starts[q − 1]`.
      const c = this.count++;
      links[c * LINK + L_PARENT] = parent;
      links[c * LINK + L_FIRST] = lo;
      links[c * LINK + L_END] = hi;
      boxes[c * BOX + B_X] = bx;
      boxes[c * BOX + B_Y] = by;
      boxes[c * BOX + B_Z] = bz;
      boxes[c * BOX + B_REACH] = half * 2;
      cells.fill(0, c * CELL, c * CELL + CELL);
      cells[c * CELL + C_WIDTH2] = 16 * half * half;
      this.largest[c] = 0;
      for (let q = 0; q < 8; q++) {
        const first = lo + (q === 0 ? 0 : starts[base + q - 1]!);
        const end = lo + starts[base + q]!;
        if (end > first) {
          this.split(
            to,
            from,
            first,
            end,
            bx + (q & 1 ? half : -half),
            by + (q & 2 ? half : -half),
            three ? bz + (q & 4 ? half : -half) : bz,
            half,
            depth,
            c,
          );
        }
      }
      links[c * LINK + L_SKIP] = this.count;
      return;
    }

    // A leaf: its box is the tight one around its points, so a single point is a box of width 0
    // (always far enough to be summed as one mass, which for one point is exact).
    const order = this.order;
    const mass = this.sm;
    const radius = this.sr;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let wx = 0;
    let wy = 0;
    let wz = 0;
    let m = 0;
    let abs = 0;
    let rad = 0;
    for (let k = lo; k < hi; k++) {
      const i = from[k]!;
      order[k] = i;
      const xi = x[i]!;
      const yi = y[i]!;
      const zi = three ? z[i]! : 0;
      if (xi < x0) x0 = xi;
      if (xi > x1) x1 = xi;
      if (yi < y0) y0 = yi;
      if (yi > y1) y1 = yi;
      if (zi < z0) z0 = zi;
      if (zi > z1) z1 = zi;
      if (mass) {
        const mi = mass[i]!;
        const a = Math.abs(mi);
        m += mi;
        abs += a;
        wx += a * xi;
        wy += a * yi;
        wz += a * zi;
      }
      if (radius && radius[i]! > rad) rad = radius[i]!;
    }
    const c = this.count++;
    const width = Math.max(x1 - x0, y1 - y0, z1 - z0);
    links[c * LINK + L_PARENT] = parent;
    links[c * LINK + L_FIRST] = lo;
    links[c * LINK + L_END] = hi;
    links[c * LINK + L_SKIP] = c + 1;
    boxes[c * BOX + B_X] = (x0 + x1) / 2;
    boxes[c * BOX + B_Y] = (y0 + y1) / 2;
    boxes[c * BOX + B_Z] = (z0 + z1) / 2;
    boxes[c * BOX + B_REACH] = width / 2;
    const o = c * CELL;
    cells[o + C_X] = wx;
    cells[o + C_Y] = wy;
    cells[o + C_Z] = wz;
    cells[o + C_MASS] = m;
    cells[o + C_WIDTH2] = width * width;
    cells[o + C_ABS] = abs;
    this.largest[c] = rad;
  }

  /**
   * For every node `i`, the sum over the other nodes `j` of `mass[j] × (p[j] − p[i]) / d²`,
   * written to `outX`/`outY`/`outZ` by node index (`outZ` is left alone by a quadtree). This is
   * the many-body sum of d3-force (a force that falls off as `1 / d`, attracting for a positive
   * mass) and, with the sign turned, the repulsion of ForceAtlas2.
   *
   * A cell is summed as one mass at its center when `width / distance < theta` and the node is
   * not inside it; `theta2 = theta²`, and 0 gives the exact sum. Pairs at `distanceMax` or
   * beyond are left out (`distanceMax2 = distanceMax²`), pairs closer than `distanceMin` are
   * softened as d3 does (`d²` is replaced by `distanceMin × d`), and coincident nodes part in a
   * direction drawn from `rng`.
   */
  accumulate(
    outX: Float64Array,
    outY: Float64Array,
    outZ: Float64Array,
    theta2: number,
    distanceMin2: number,
    distanceMax2: number,
    rng: Lcg,
  ): void {
    const { order, points, cells, links, three } = this;
    const n = this.size;
    const count = this.count;
    for (let s = 0; s < n; s++) {
      const self = s << 2;
      const x = points[self + P_X]!;
      const y = points[self + P_Y]!;
      const z = points[self + P_Z]!;
      let ax = 0;
      let ay = 0;
      let az = 0;
      let c = 0;
      while (c < count) {
        const o = c << 3;
        const k = c << 2;
        let dx = cells[o + C_X]! - x;
        let dy = cells[o + C_Y]! - y;
        let dz = cells[o + C_Z]! - z;
        let l = dx * dx + dy * dy + dz * dz;
        if (
          cells[o + C_WIDTH2]! < l * theta2 &&
          (s < links[k + L_FIRST]! || s >= links[k + L_END]!)
        ) {
          if (l < distanceMax2) {
            if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
            const f = cells[o + C_MASS]! / l;
            ax += dx * f;
            ay += dy * f;
            az += dz * f;
          }
          c = links[k + L_SKIP]!;
        } else if (links[k + L_SKIP] === c + 1) {
          for (let t = links[k + L_FIRST]! << 2, stop = links[k + L_END]! << 2; t < stop; t += 4) {
            if (t === self) continue;
            dx = points[t + P_X]! - x;
            dy = points[t + P_Y]! - y;
            dz = points[t + P_Z]! - z;
            l = dx * dx + dy * dy + dz * dz;
            if (l >= distanceMax2) continue;
            if (l === 0) {
              dx = rng.jiggle();
              dy = rng.jiggle();
              if (three) dz = rng.jiggle();
              l = dx * dx + dy * dy + dz * dz;
            }
            if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
            const f = points[t + P_MASS]! / l;
            ax += dx * f;
            ay += dy * f;
            az += dz * f;
          }
          c++;
        } else {
          c++;
        }
      }
      const i = order[s]!;
      outX[i] = ax;
      outY[i] = ay;
      if (three) outZ[i] = az;
    }
  }

  /**
   * Collision between the points, each a circle (a sphere in an octree) of the radius the tree
   * was built with: for every pair closer than the sum of its radii, add to `outX`/`outY`/`outZ`
   * (by node index) the moves that push it apart along the line between the centers. The smaller
   * point takes the larger share, in proportion to the squared radii as d3-force's `forceCollide`
   * does. A point with `pinned[i] === 1` does not give way: the other takes the whole push.
   * `strength` is the share of each overlap removed (1: all of it). Returns the deepest overlap
   * found between two points that are not both pinned (0: none overlap).
   *
   * The walk goes leaf by leaf: the pairs within the leaf, then the cells after it in tree order,
   * passing over every cell whose box, grown by its largest radius, does not reach the leaf's.
   * Every pair of leaves is so met once, from the earlier one, and no walk starts at the root.
   *
   * A push moves the tree's own copy of the two points at once, so a point squeezed between
   * several neighbours is not pushed by each as if the others had done nothing (measured on a
   * dense clump: the overlap left after a pass falls about three times as fast). The boxes are not
   * updated: a pair that a push of this pass brings together is found by the next.
   */
  separate(
    outX: Float64Array,
    outY: Float64Array,
    outZ: Float64Array,
    pinned: Uint8Array,
    strength: number,
    rng: Lcg,
  ): number {
    const { order, points, radii, links, boxes, three } = this;
    const count = this.count;
    let deepest = 0;

    /** Separate slots `s` and `t` if they overlap. */
    const pair = (s: number, t: number): void => {
      const ri = radii[s]!;
      const rj = radii[t]!;
      const r = ri + rj;
      let dx = points[(s << 2) + P_X]! - points[(t << 2) + P_X]!;
      let dy = points[(s << 2) + P_Y]! - points[(t << 2) + P_Y]!;
      let dz = points[(s << 2) + P_Z]! - points[(t << 2) + P_Z]!;
      let l = dx * dx + dy * dy + dz * dz;
      if (!(l < r * r)) return;
      const i = order[s]!;
      const j = order[t]!;
      if (pinned[i] === 1 && pinned[j] === 1) return;
      if (l === 0) {
        dx = rng.jiggle();
        dy = rng.jiggle();
        if (three) dz = rng.jiggle();
        l = dx * dx + dy * dy + dz * dz;
      }
      l = Math.sqrt(l);
      if (r - l > deepest) deepest = r - l;
      const f = ((r - l) / l) * strength;
      const share = pinned[j] === 1 ? 1 : pinned[i] === 1 ? 0 : (rj * rj) / (ri * ri + rj * rj);
      dx *= f;
      dy *= f;
      dz *= f;
      outX[i]! += dx * share;
      outY[i]! += dy * share;
      outZ[i]! += dz * share;
      outX[j]! -= dx * (1 - share);
      outY[j]! -= dy * (1 - share);
      outZ[j]! -= dz * (1 - share);
      // The pairs after this one see the two where this one put them.
      points[(s << 2) + P_X]! += dx * share;
      points[(s << 2) + P_Y]! += dy * share;
      points[(s << 2) + P_Z]! += dz * share;
      points[(t << 2) + P_X]! -= dx * (1 - share);
      points[(t << 2) + P_Y]! -= dy * (1 - share);
      points[(t << 2) + P_Z]! -= dz * (1 - share);
    };

    for (let leaf = 0; leaf < count; leaf++) {
      if (links[(leaf << 2) + L_SKIP] !== leaf + 1) continue;
      const first = links[(leaf << 2) + L_FIRST]!;
      const end = links[(leaf << 2) + L_END]!;
      for (let s = first; s < end; s++) {
        for (let t = s + 1; t < end; t++) pair(s, t);
      }
      const x = boxes[(leaf << 2) + B_X]!;
      const y = boxes[(leaf << 2) + B_Y]!;
      const z = boxes[(leaf << 2) + B_Z]!;
      const reach = boxes[(leaf << 2) + B_REACH]!;
      let c = leaf + 1;
      while (c < count) {
        const o = c << 2;
        const far = reach + boxes[o + B_REACH]!;
        if (
          Math.abs(boxes[o + B_X]! - x) > far ||
          Math.abs(boxes[o + B_Y]! - y) > far ||
          Math.abs(boxes[o + B_Z]! - z) > far
        ) {
          c = links[o + L_SKIP]!;
          continue;
        }
        if (links[o + L_SKIP] === c + 1) {
          const stop = links[o + L_END]!;
          for (let s = first; s < end; s++) {
            for (let t = links[o + L_FIRST]!; t < stop; t++) pair(s, t);
          }
        }
        c++;
      }
    }
    return deepest;
  }
}
