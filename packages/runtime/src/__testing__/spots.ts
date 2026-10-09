/** Test trace for conditional styling (E8.5, E8.6); not exported from the package. */
import { attr, type CoreTraceModule } from '@mk7s/holochart-core';

/** A trace type with per-point attributes of every kind rules and functions target. */
export const spots: CoreTraceModule = {
  type: 'spots',
  categories: ['cartesian'],
  schema: attr.object({
    x: attr.dataArray({ editType: 'calc' }),
    y: attr.dataArray({ editType: 'calc' }),
    z: attr.dataArray({ editType: 'calc' }),
    text: attr.string({ arrayOk: true, editType: 'plot' }),
    mode: attr.enumerated({ values: ['markers', 'lines'], dflt: 'markers', editType: 'calc' }),
    marker: attr.object({
      color: attr.color({ arrayOk: true, editType: 'style' }),
      size: attr.number({ min: 0, dflt: 6, arrayOk: true, editType: 'calc' }),
      symbol: attr.enumerated({
        values: ['circle', 'square'],
        dflt: 'circle',
        arrayOk: true,
        editType: 'style',
      }),
      line: attr.object({ width: attr.number({ min: 0, dflt: 0, arrayOk: true }) }),
    }),
    fill: attr.enumerated({ values: ['none', 'tozeroy'], dflt: 'none', editType: 'calc' }),
  }),
  meta: { description: 'Test spots.' },
  supplyDefaults(_in, out, ctx) {
    const x = ctx.coerce<ArrayLike<unknown> | undefined>('x');
    const y = ctx.coerce<ArrayLike<unknown> | undefined>('y');
    ctx.coerce('z');
    ctx.coerce('text');
    if (ctx.coerce('mode') === 'markers') {
      ctx.coerce('marker.color', ctx.defaultColor);
      ctx.coerce('marker.size');
      ctx.coerce('marker.symbol');
      ctx.coerce('marker.line.width');
    }
    ctx.coerce('fill');
    out['_length'] = Math.min(x?.length ?? 0, y?.length ?? 0);
  },
};
