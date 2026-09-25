/**
 * `parcoords` supply-defaults (plan E10.10), following plotly.js' `parcoords/defaults.js`: at most
 * 60 dimensions; a dimension without values is hidden; label, range, ticks, `multiselect` and a
 * cleaned `constraintrange` for visible ones; `line.color` with its colorscale; the fonts from
 * `layout.font` at 1/1.2 the size. `_length` is the number of lines: the shortest visible
 * dimension (and numeric `line.color`).
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyFontDefaults, supplyLineDefaults } from './common.ts';
import { cleanRanges, numericTicks, storedRanges } from './ranges.ts';

/** Plotly's `maxDimensionCount`. */
export const MAX_DIMENSIONS = 60;

export function supplyParcoordsDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const input = traceIn['dimensions'];
  const dimsIn = Array.isArray(input) ? input.slice(0, MAX_DIMENSIONS) : [];
  if (dimsIn.length === 0) {
    traceOut.visible = false;
    return;
  }
  let length = supplyLineDefaults(traceIn, traceOut, ctx);
  const dims: Record<string, unknown>[] = dimsIn.map(() => ({}));
  traceOut['dimensions'] = dims;
  dims.forEach((dim, i) => {
    const p = `dimensions[${i}].`;
    const values = ctx.coerce(`${p}values`);
    let visible = ctx.coerce<boolean>(`${p}visible`);
    if (!isArrayLike(values) || values.length === 0) {
      visible = false;
      dim['visible'] = false;
    }
    dim['_index'] = i;
    if (!visible) return;
    ctx.coerce(`${p}label`);
    const tickvals = ctx.coerce(`${p}tickvals`);
    ctx.coerce(`${p}ticktext`);
    ctx.coerce(`${p}tickformat`);
    ctx.coerce(`${p}range`);
    const multiselect = ctx.coerce<boolean>(`${p}multiselect`);
    const ranges = cleanRanges(
      ctx.coerce(`${p}constraintrange`),
      multiselect,
      numericTicks(tickvals),
    );
    const stored = storedRanges(ranges);
    if (stored) dim['constraintrange'] = stored;
    else delete dim['constraintrange'];
    length = Math.min(length, (values as ArrayLike<unknown>).length);
  });
  traceOut._length = Number.isFinite(length) ? length : 0;

  ctx.coerce('labelangle');
  ctx.coerce('labelside');
  supplyFontDefaults(ctx, 'labelfont', 1 / 1.2);
  supplyFontDefaults(ctx, 'tickfont', 1 / 1.2);
  supplyFontDefaults(ctx, 'rangefont', 1 / 1.2);
  ctx.coerce('unselected.line.color');
  ctx.coerce('unselected.line.opacity');
}
