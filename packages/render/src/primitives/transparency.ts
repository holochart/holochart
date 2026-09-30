/**
 * Transparency in 3D scenes (plan E2.14, 3D part).
 *
 * - **Between objects**: three.js draws opaque objects first (depth write on), then transparent
 *   ones back to front by the view depth of their bounding sphere's center, as long as they share
 *   a `renderOrder`. {@link orderTranslucent} assigns render orders explicitly for scenes that
 *   use `renderOrder` for layering (as the 2D subplots do) or disable `sortObjects`.
 * - **Within a mesh**: a translucent mesh that overlaps itself (a folded surface, a closed
 *   isosurface) needs its triangles drawn back to front too. {@link sortTrianglesByDepth} orders
 *   them by the view depth of their centroids with a stable 16-bit counting sort (O(n), and
 *   deterministic for equal depths); the mesh primitive rewrites its index buffer with it when the
 *   view changes.
 * - **Depth writes**: translucent meshes don't write depth (so nothing behind them, drawn later in
 *   a sorted pass, is lost); double-sided translucent meshes draw their back faces first, then
 *   their front faces (three.js' two-pass `DoubleSide` transparency).
 *
 * Weighted blended order-independent transparency for dense translucent meshes is deferred (P2).
 */
import { Box3, Vector3, type Camera, type Material, type Mesh, type Object3D } from 'three';

/** Above this many triangles, `sortTriangles: 'auto'` leaves a translucent mesh unsorted. */
export const MESH_SORT_LIMIT = 500_000;

const BUCKETS = 65536;
const counts = new Uint32Array(BUCKETS);
let keys = new Float32Array(0);

/**
 * Triangle draw order, farthest first. `centroids` holds 3 floats per triangle in the mesh's local
 * space (NaN: invalid, drawn first); `modelView` is the column-major model-view matrix (only its
 * third row, the view-space z, is read). Returns `order` (triangle indices).
 */
export function sortTrianglesByDepth(
  centroids: Float32Array,
  modelView: ArrayLike<number>,
  order: Uint32Array = new Uint32Array(Math.floor(centroids.length / 3)),
): Uint32Array {
  const n = Math.floor(centroids.length / 3);
  if (keys.length < n) keys = new Float32Array(n);
  const m2 = modelView[2]!;
  const m6 = modelView[6]!;
  const m10 = modelView[10]!;
  const m14 = modelView[14]!;
  let min = Infinity;
  let max = -Infinity;
  for (let t = 0; t < n; t++) {
    const o = t * 3;
    // View-space z: more negative is farther from the camera.
    const z = m2 * centroids[o]! + m6 * centroids[o + 1]! + m10 * centroids[o + 2]! + m14;
    keys[t] = z;
    if (z < min) min = z;
    if (z > max) max = z;
  }
  counts.fill(0);
  const scale = max > min ? (BUCKETS - 1) / (max - min) : 0;
  for (let t = 0; t < n; t++) {
    const z = keys[t]!;
    const b = z >= min ? Math.floor((z - min) * scale) : 0;
    keys[t] = b;
    counts[b]!++;
  }
  let sum = 0;
  for (let b = 0; b < BUCKETS; b++) {
    const c = counts[b]!;
    counts[b] = sum;
    sum += c;
  }
  for (let t = 0; t < n; t++) order[counts[keys[t]!]!++] = t;
  return order;
}

/** Centroids (3 floats per triangle) of drawn triangles; NaN for invalid triangles. */
export function triangleCentroids(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  valid: (t: number) => boolean,
  out: Float32Array = new Float32Array(index.length),
): Float32Array {
  const n = Math.floor(index.length / 3);
  for (let t = 0; t < n; t++) {
    const o = t * 3;
    if (!valid(t)) {
      out[o] = out[o + 1] = out[o + 2] = NaN;
      continue;
    }
    const a = index[o]! * 3;
    const b = index[o + 1]! * 3;
    const c = index[o + 2]! * 3;
    for (let k = 0; k < 3; k++) {
      out[o + k] = (positions[a + k]! + positions[b + k]! + positions[c + k]!) / 3;
    }
  }
  return out;
}

/** Write `index` reordered by triangle `order` into `out`. */
export function reorderTriangles(
  index: ArrayLike<number>,
  order: ArrayLike<number>,
  out: Uint32Array | Uint16Array,
): void {
  for (let i = 0; i < order.length; i++) {
    const s = order[i]! * 3;
    const d = i * 3;
    out[d] = index[s]!;
    out[d + 1] = index[s + 1]!;
    out[d + 2] = index[s + 2]!;
  }
}

function isTranslucent(material: Material | Material[]): boolean {
  return Array.isArray(material) ? material.some((m) => m.transparent) : material.transparent;
}

const box = new Box3();
const center = new Vector3();

/**
 * Give the translucent meshes among `objects` (searched recursively) render orders
 * `base, base + step, …` from the farthest to the nearest (view depth of their world bounding box
 * center), for scenes where three.js' own depth sort doesn't apply. Returns the next free order.
 */
export function orderTranslucent(
  objects: readonly Object3D[],
  camera: Camera,
  base = 0,
  step = 1e-3,
): number {
  const found: { mesh: Mesh; z: number }[] = [];
  for (const root of objects) {
    root.traverseVisible((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || !isTranslucent(mesh.material)) return;
      box.setFromObject(mesh);
      if (box.isEmpty()) center.setFromMatrixPosition(mesh.matrixWorld);
      else box.getCenter(center);
      center.applyMatrix4(camera.matrixWorldInverse);
      found.push({ mesh, z: center.z });
    });
  }
  // Farthest (most negative view z) first; ties keep scene order.
  found.sort((a, b) => a.z - b.z);
  let order = base;
  for (const { mesh } of found) {
    mesh.renderOrder = order;
    order += step;
  }
  return order;
}
