/**
 * The icicle layout (plan E13.4), ported from plotly.js' `traces/icicle/partition.js`: d3's
 * `partition` with `tiling.pad`, levels across the domain's height (`orientation: 'v'`) or, by
 * transposing, its width (`'h'`, the default), mirrored by `flip`. With `maxdepth`, the drawn levels
 * fill the domain and deeper ones fall outside it.
 */
import type { HierNode } from '../hierarchy/build.ts';
import { partition, type PartitionCell } from '../hierarchy/levels.ts';
import { numberIn, type CellLayout } from '../treemap/geometry.ts';
import { flipCells } from '../treemap/tiling.ts';

/** Options of {@link iciclePartition}. */
export interface IcicleTiling {
  readonly orientation: 'v' | 'h';
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  /** `tiling.pad`, px. */
  readonly pad: number;
  /** Levels drawn (Plotly's `_maxDepth`). */
  readonly maxDepth: number;
}

/** The icicle layout of the subtree at `entry` over `[0, width] × [0, height]` (y down). */
export function iciclePartition(
  entry: HierNode,
  width: number,
  height: number,
  opts: IcicleTiling,
): PartitionCell[] {
  const { flipX = false, flipY = false } = opts;
  const swap = opts.orientation === 'h';
  const levels = entry.height + 1;
  const stretch =
    opts.maxDepth > 0 && Number.isFinite(opts.maxDepth)
      ? levels / Math.min(levels, opts.maxDepth)
      : 1;
  const cells = swap
    ? partition(entry, height, width * stretch, opts.pad)
    : partition(entry, width, height * stretch, opts.pad);
  if (swap || flipX || flipY) flipCells(cells, width, height, { swap, flipX, flipY });
  return cells;
}

/** The icicle partition of a trace (Plotly's `partition` options from `tiling`). */
export const icicleCells: CellLayout = (entry, trace, width, height, cutoff) => {
  const tiling = trace['tiling'] as Record<string, unknown> | undefined;
  const flip = typeof tiling?.['flip'] === 'string' ? tiling['flip'] : '';
  return iciclePartition(entry, width, height, {
    orientation: tiling?.['orientation'] === 'v' ? 'v' : 'h',
    flipX: flip.includes('x'),
    flipY: flip.includes('y'),
    pad: numberIn(tiling, 'pad'),
    maxDepth: cutoff,
  });
};
