/**
 * `parcats` supply-defaults (plan E10.11), following plotly.js' `parcats/defaults.js`: a dimension
 * without values is hidden; `categoryorder` defaults to `'array'` when `categoryarray` is a
 * non-empty array (and falls back to `'trace'` without one); `categoryarray` / `ticktext` are kept
 * only for `'array'`; `displayindex` defaults to the dimension's index. `_length` is the number of
 * samples: the shortest visible dimension (and numeric `line.color`). The trace is hidden without
 * visible dimensions.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyFontDefaults, supplyLineDefaults } from '../parcoords/common.ts';

export function supplyParcatsDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const input = traceIn['dimensions'];
  const dimsIn = Array.isArray(input) ? (input as unknown[]) : [];
  // Plotly parcats: `autocolorscale` defaults on unless a colorscale is given.
  let length = supplyLineDefaults(traceIn, traceOut, ctx, true);
  ctx.coerce('line.shape');
  ctx.coerce('line.hovertemplate');
  const dims: Record<string, unknown>[] = dimsIn.map(() => ({}));
  traceOut['dimensions'] = dims;
  let shown = 0;
  dims.forEach((dim, i) => {
    const p = `dimensions[${i}].`;
    const values = ctx.coerce(`${p}values`);
    let visible = ctx.coerce<boolean>(`${p}visible`);
    if (!isArrayLike(values) || values.length === 0) visible = dim['visible'] = false;
    dim['_index'] = i;
    if (!visible) return;
    shown++;
    ctx.coerce(`${p}label`);
    ctx.coerce(`${p}displayindex`, i);
    const raw = (dimsIn[i] as Record<string, unknown> | null)?.['categoryarray'];
    const valid = isArrayLike(raw) && raw.length > 0;
    const order = ctx.coerce<string>(`${p}categoryorder`, valid ? 'array' : 'trace');
    if (order === 'array') {
      ctx.coerce(`${p}categoryarray`);
      ctx.coerce(`${p}ticktext`);
      if (!valid) dim['categoryorder'] = 'trace';
    }
    if (dim['categoryorder'] !== 'array') {
      delete dim['categoryarray'];
      delete dim['ticktext'];
    }
    length = Math.min(length, (values as ArrayLike<unknown>).length);
  });
  if (shown === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut._length = Number.isFinite(length) ? length : 0;
  for (const key of ['hoveron', 'arrangement', 'bundlecolors', 'sortpaths', 'counts']) {
    ctx.coerce(key);
  }
  supplyFontDefaults(ctx, 'labelfont', 1);
  supplyFontDefaults(ctx, 'tickfont', 1 / 1.2);
}
