/**
 * The vector field of a `streamtube` (plan E14.6): the grid behind the flattened `x`, `y`, `z`
 * columns and trilinear sampling, after plotly.js `streamtube/calc.js` (`processGrid`) and
 * gl-streamtube3d (`sampleMeshgrid`). Pure (no three.js, no DOM), so it can move to a worker.
 *
 * - **Grid detection** ({@link detectStreamGrid}): the columns must list a regular, possibly
 *   non-uniform, rectilinear grid, one axis varying fastest (any of the six orders), each axis
 *   ascending or descending. The order is the order in which the axes first change (`+x+y+z`: x
 *   fastest, then y, then z; `-` for an axis whose first value is above its last); the nodes of
 *   each axis are the column's distinct values (merged within 1e-4 of the mean spacing, like
 *   plotly.js `distinctVals`). Fewer entries than nodes (an over-specified mesh) or coordinates
 *   that are not monotonic along the fill order (arbitrary points) give no grid, as in Plotly.
 * - **Sampling** ({@link sampleStreamGrid}): trilinear inside the grid; outside it, the value at
 *   the nearest point of the grid (gl-streamtube3d clamps its cell indices). The same call gives
 *   the Jacobian `∂V/∂X` of the trilinear field in the cell (0 along an axis outside the grid or
 *   with a single node): gl-streamtube3d's forward difference (`ε = 1e-4`) of the same field,
 *   analytically, so both agree except within `ε` of a cell face.
 */

/** A rectilinear grid with a vector per node. @experimental */
export interface StreamGrid {
  /** Node coordinates per axis, ascending. */
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly zs: Float64Array;
  /** The vectors at the nodes, x fastest: node `(i, j, k)` is `i + nx · (j + ny · k)`. */
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly w: Float64Array;
}

/** What {@link detectStreamGrid} found. */
export interface StreamGridDetection {
  /** The grid, or null (see `reason`). */
  readonly grid: StreamGrid | null;
  /** Plotly's `gridFill`: the axes fastest first, each with its direction, e.g. `'+x+y+z'`. */
  readonly fill: string;
  readonly reason?: 'empty' | 'over-specified' | 'arbitrary';
}

/** Sorted distinct finite values, merging values closer than 1e-4 of the mean spacing. */
export function distinctValues(values: ArrayLike<number>, n = values.length): Float64Array {
  const all = new Float64Array(n);
  let len = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) all[len++] = v;
  }
  const sorted = all.subarray(0, len).sort();
  if (len === 0) return sorted;
  const tolerance = (sorted[len - 1]! - sorted[0]! || 1) / (len - 1 || 1) / 10000;
  const out: number[] = [sorted[0]!];
  for (let i = 1; i < len; i++) {
    if (sorted[i]! > out[out.length - 1]! + tolerance) out.push(sorted[i]!);
  }
  return Float64Array.from(out);
}

type Axis = 0 | 1 | 2;
const LETTERS = ['x', 'y', 'z'] as const;

/**
 * Detect the grid of flattened columns (`len` entries of each: the shortest column's length) and
 * reorder its vectors x fastest. See the module comment.
 * @internal
 */
export function detectStreamGrid(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number>,
  u: ArrayLike<number>,
  v: ArrayLike<number>,
  w: ArrayLike<number>,
  len: number,
): StreamGridDetection {
  const cols = [x, y, z] as const;
  // The fill order: the axes in the order they first leave their first value.
  const order: Axis[] = [];
  for (let i = 1; i < len && order.length < 3; i++) {
    for (const a of [0, 1, 2] as const) {
      if (!order.includes(a) && cols[a][i] !== cols[a][0]) order.push(a);
    }
  }
  for (const a of [0, 1, 2] as const) if (!order.includes(a)) order.push(a);
  const reversed = cols.map((c) => len > 1 && c[0]! > c[len - 1]!);
  const fill = order.map((a) => (reversed[a] ? '-' : '+') + LETTERS[a]).join('');
  const none = (reason: StreamGridDetection['reason']): StreamGridDetection => ({
    grid: null,
    fill,
    reason,
  });
  if (len <= 0) return none('empty');
  for (const c of cols) {
    for (let i = 0; i < len; i++) if (!Number.isFinite(c[i]!)) return none('arbitrary');
  }
  const nodes = cols.map((c) => distinctValues(c, len)) as [
    Float64Array,
    Float64Array,
    Float64Array,
  ];
  const n = nodes.map((a) => a.length) as [number, number, number];
  const total = n[0] * n[1] * n[2];
  if (len < total) return none('over-specified');
  // Strictly monotonic along each axis, in its direction (Plotly checks each cell's corner).
  const [fast, mid, slow] = order as [Axis, Axis, Axis];
  const stride = [0, 0, 0];
  stride[fast] = 1;
  stride[mid] = n[fast];
  stride[slow] = n[fast] * n[mid];
  const [sx, sy, sz] = stride as [number, number, number];
  const [nx, ny, nz] = n;
  const [cx, cy, cz] = cols;
  const [dx, dy, dz] = reversed.map((r) => (r ? -1 : 1)) as [number, number, number];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // Index in the input of node (i, j, k), each axis counted along its direction.
        const at = i * sx + j * sy + k * sz;
        if (i + 1 < nx && !(cx[at]! * dx < cx[at + sx]! * dx)) return none('arbitrary');
        if (j + 1 < ny && !(cy[at]! * dy < cy[at + sy]! * dy)) return none('arbitrary');
        if (k + 1 < nz && !(cz[at]! * dz < cz[at + sz]! * dz)) return none('arbitrary');
      }
    }
  }
  // Reorder the vectors x fastest, ascending coordinates.
  const gu = new Float64Array(total);
  const gv = new Float64Array(total);
  const gw = new Float64Array(total);
  // Input index of ascending node (i, j, k): `base + i · ax + j · ay + k · az`.
  const [ax, ay, az] = [dx * sx, dy * sy, dz * sz];
  const base =
    (dx < 0 ? (nx - 1) * sx : 0) + (dy < 0 ? (ny - 1) * sy : 0) + (dz < 0 ? (nz - 1) * sz : 0);
  let to = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++, to++) {
        const at = base + i * ax + j * ay + k * az;
        gu[to] = u[at]!;
        gv[to] = v[at]!;
        gw[to] = w[at]!;
      }
    }
  }
  return { grid: { xs: nodes[0], ys: nodes[1], zs: nodes[2], u: gu, v: gv, w: gw }, fill };
}

/**
 * The cell of `t` on ascending nodes: `i` with `nodes[i] ≤ t < nodes[i + 1]` (the last cell at
 * the last node), the fraction `f` across it and whether `t` lies inside `[first, last]`.
 */
function locate(nodes: Float64Array, t: number, out: { i: number; f: number; h: number }): boolean {
  const n = nodes.length;
  if (n < 2) {
    out.i = 0;
    out.f = 0;
    out.h = 0;
    return false;
  }
  if (!(t >= nodes[0]!)) {
    out.i = 0;
    out.f = 0;
    out.h = nodes[1]! - nodes[0]!;
    return false;
  }
  if (t >= nodes[n - 1]!) {
    out.i = n - 2;
    out.f = 1;
    out.h = nodes[n - 1]! - nodes[n - 2]!;
    return false;
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (nodes[m]! <= t) lo = m;
    else hi = m;
  }
  out.i = lo;
  out.h = nodes[lo + 1]! - nodes[lo]!;
  out.f = (t - nodes[lo]!) / out.h;
  return true;
}

const cx = { i: 0, f: 0, h: 0 };
const cy = { i: 0, f: 0, h: 0 };
const cz = { i: 0, f: 0, h: 0 };

/**
 * Sample the grid's vector at `(x, y, z)` into `out[0..2]` (trilinear, clamped to the grid) and,
 * with `jacobian`, its Jacobian `J[3·i + j] = ∂Vᵢ/∂Xⱼ` (see the module comment).
 * @internal
 */
export function sampleStreamGrid(
  grid: StreamGrid,
  x: number,
  y: number,
  z: number,
  out: Float64Array,
  jacobian?: Float64Array,
): void {
  const inX = locate(grid.xs, x, cx);
  const inY = locate(grid.ys, y, cy);
  const inZ = locate(grid.zs, z, cz);
  const nx = grid.xs.length;
  const ny = grid.ys.length;
  const nxy = nx * ny;
  const x1 = nx > 1 ? 1 : 0;
  const y1 = ny > 1 ? nx : 0;
  const z1 = grid.zs.length > 1 ? nxy : 0;
  const base = cx.i + nx * cy.i + nxy * cz.i;
  const fx = cx.f;
  const fy = cy.f;
  const fz = cz.f;
  const gx = 1 - fx;
  const gy = 1 - fy;
  const gz = 1 - fz;
  const comps = [grid.u, grid.v, grid.w];
  for (let c = 0; c < 3; c++) {
    const a = comps[c]!;
    const v000 = a[base]!;
    const v100 = a[base + x1]!;
    const v010 = a[base + y1]!;
    const v110 = a[base + x1 + y1]!;
    const v001 = a[base + z1]!;
    const v101 = a[base + x1 + z1]!;
    const v011 = a[base + y1 + z1]!;
    const v111 = a[base + x1 + y1 + z1]!;
    // Along x, then y, then z (gl-streamtube3d's lerp order).
    const c00 = v000 * gx + v100 * fx;
    const c10 = v010 * gx + v110 * fx;
    const c01 = v001 * gx + v101 * fx;
    const c11 = v011 * gx + v111 * fx;
    const c0 = c00 * gy + c10 * fy;
    const c1 = c01 * gy + c11 * fy;
    out[c] = c0 * gz + c1 * fz;
    if (!jacobian) continue;
    jacobian[c * 3] = inX
      ? ((v100 - v000) * gy * gz +
          (v110 - v010) * fy * gz +
          (v101 - v001) * gy * fz +
          (v111 - v011) * fy * fz) /
        cx.h
      : 0;
    jacobian[c * 3 + 1] = inY ? ((c10 - c00) * gz + (c11 - c01) * fz) / cy.h : 0;
    jacobian[c * 3 + 2] = inZ ? (c1 - c0) / cz.h : 0;
  }
}
