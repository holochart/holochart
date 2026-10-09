/**
 * Packing of the disconnected parts of a layered layout (story G3): each part is laid out on its
 * own and is a box here; the boxes are put side by side on shelves, a new shelf starting when the
 * current one is as long as the shape asked for allows. Shelves run across the layers and stack
 * along the ranks, so every part keeps its first rank on its shelf's edge, as a reader expects of
 * a layered drawing.
 *
 * Deterministic: the boxes are placed in the order given (the caller sorts them, largest first).
 */

export interface Packing {
  /** Where each box's corner (its lowest coordinates) goes. */
  readonly across: Float64Array;
  readonly along: Float64Array;
  /** Extent of the whole packing. */
  readonly width: number;
  readonly height: number;
}

/**
 * Places boxes of `widths` (across the layers) and `heights` (along the ranks) on shelves, `gap`
 * apart, aiming at `aspect` = width over height for the whole.
 */
export function packShelves(
  widths: Float64Array,
  heights: Float64Array,
  gap: number,
  aspect: number,
): Packing {
  const n = widths.length;
  const across = new Float64Array(n);
  const along = new Float64Array(n);
  let widest = 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    widest = Math.max(widest, widths[i]!);
    area += (widths[i]! + gap) * (heights[i]! + gap);
  }
  const limit = Math.max(widest, Math.sqrt(area * aspect));
  let at = 0;
  let shelf = 0;
  let shelfHeight = 0;
  let width = 0;
  let height = 0;
  for (let i = 0; i < n; i++) {
    if (at > 0 && at + widths[i]! > limit) {
      shelf += shelfHeight + gap;
      at = 0;
      shelfHeight = 0;
    }
    across[i] = at;
    along[i] = shelf;
    at += widths[i]! + gap;
    shelfHeight = Math.max(shelfHeight, heights[i]!);
    width = Math.max(width, across[i]! + widths[i]!);
    height = Math.max(height, shelf + heights[i]!);
  }
  return { across, along, width, height };
}
