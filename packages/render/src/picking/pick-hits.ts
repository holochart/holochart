/**
 * Decoding a read-back pick window into distinct, distance-sorted hits (ADR-010).
 */
import { decodePickId } from './pick-id.ts';
import { windowPixelDistance, windowPixelVisible, type PickWindow } from './pick-window.ts';

/**
 * Reusable output of {@link gatherPickHits}: parallel arrays of pick ids and CSS distances, sorted
 * by distance (ties by id). Only the first `count` entries are valid.
 */
export class PickHitList {
  count = 0;
  readonly ids: number[] = [];
  readonly distances: number[] = [];
  /** Hit slot per id while gathering (cleared each time). */
  readonly #slots = new Map<number, number>();
  /** Sort permutation scratch. */
  readonly #order: number[] = [];
  readonly #tmpIds: number[] = [];
  readonly #tmpDistances: number[] = [];
  readonly #compare = (a: number, b: number): number =>
    this.distances[a]! - this.distances[b]! || this.ids[a]! - this.ids[b]!;

  clear(): void {
    this.count = 0;
    this.#slots.clear();
  }

  /** Record `id` at `distance`, keeping the minimum distance per id. */
  add(id: number, distance: number): void {
    const slot = this.#slots.get(id);
    if (slot === undefined) {
      const k = this.count++;
      this.ids[k] = id;
      this.distances[k] = distance;
      this.#slots.set(id, k);
    } else if (distance < this.distances[slot]!) {
      this.distances[slot] = distance;
    }
  }

  /** Sort the valid entries by distance, then id (deterministic for equal distances). */
  sort(): void {
    const n = this.count;
    const order = this.#order;
    const ids = this.ids;
    const dist = this.distances;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort(this.#compare);
    const ti = this.#tmpIds;
    const td = this.#tmpDistances;
    for (let i = 0; i < n; i++) {
      ti[i] = ids[order[i]!]!;
      td[i] = dist[order[i]!]!;
    }
    for (let i = 0; i < n; i++) {
      ids[i] = ti[i]!;
      dist[i] = td[i]!;
    }
    this.#slots.clear();
  }
}

/**
 * Collect the distinct pick ids in a read-back window. `pixels` holds `win.size²` RGBA8 pixels,
 * rows bottom-up (as `readPixels` returns them). A pixel counts when it is not background, lies in
 * the view's visible region, and its centre is within `win.radius` CSS px of the cursor (the pixel
 * under the cursor always counts). Each id keeps its smallest distance; `out` ends sorted nearest
 * first. `maxHits` stops after that many distinct ids in distance order (default: all).
 */
export function gatherPickHits(
  pixels: ArrayLike<number>,
  win: Readonly<PickWindow>,
  out: PickHitList,
  maxHits = Infinity,
): PickHitList {
  out.clear();
  const n = win.size;
  const radius = win.radius;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4;
      const id = decodePickId(pixels[k]!, pixels[k + 1]!, pixels[k + 2]!, pixels[k + 3]!);
      if (id < 0) continue;
      if (!windowPixelVisible(win, i, j)) continue;
      const d = windowPixelDistance(win, i, j);
      if (d > radius && d !== 0) continue;
      out.add(id, d);
    }
  }
  out.sort();
  if (out.count > maxHits) out.count = Math.max(0, Math.floor(maxHits));
  return out;
}
