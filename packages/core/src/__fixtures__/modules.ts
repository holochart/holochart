/**
 * Test-only trace modules and components that exercise the schema/defaults machinery. They are
 * deliberately small and are NOT exported from the package; the real modules live in
 * `@mk7s/holochart-traces-basic` and `@mk7s/holochart-components`.
 */
import { attr } from '../schema/attr.ts';
import { fontSchema } from '../layout/schema.ts';
import type { ComponentModule, TraceModule } from '../registry/types.ts';
import { createRegistry } from '../registry/registry.ts';
import type { Registry } from '../registry/types.ts';

const markerLine = attr.object(
  {
    color: attr.color({ arrayOk: true, description: 'Marker outline color.' }),
    width: attr.number({ min: 0, dflt: 0, arrayOk: true, description: 'Outline width (px).' }),
  },
  { editType: 'style' },
);

/** Mini scatter: `mode` flaglist with conditional marker/line/text defaults. */
export const scatterSchema = attr.object({
  x: attr.dataArray({ editType: 'calc', role: 'data', description: 'x coordinates.' }),
  y: attr.dataArray({ editType: 'calc', role: 'data', description: 'y coordinates.' }),
  mode: attr.flaglist({
    flags: ['lines', 'markers', 'text'],
    extras: ['none'],
    editType: 'calc',
    description: 'Drawing mode. Defaults to `lines+markers` below 20 points, else `lines`.',
  }),
  text: attr.string({ arrayOk: true, dflt: '', editType: 'calc' }),
  textfont: fontSchema('Text font.'),
  marker: attr.object(
    {
      color: attr.color({ arrayOk: true, editType: 'style', animatable: true }),
      size: attr.number({ min: 0, dflt: 6, arrayOk: true, editType: 'calcIfAutorange' }),
      symbol: attr.enumerated({
        values: ['circle', 'square', 'diamond'],
        dflt: 'circle',
        arrayOk: true,
        editType: 'style',
      }),
      opacity: attr.number({ min: 0, max: 1, arrayOk: true, editType: 'style' }),
      line: markerLine,
    },
    { editType: 'calc' },
  ),
  line: attr.object(
    {
      color: attr.color(),
      width: attr.number({ min: 0, dflt: 2 }),
      dash: attr.enumerated({ values: ['solid', 'dot', 'dash'], dflt: 'solid' }),
    },
    { editType: 'style' },
  ),
  legacy: attr.number({ deprecated: 'use `marker.size` instead', editType: 'calc' }),
});

export const scatter: TraceModule<typeof scatterSchema.children> = {
  type: 'scatter',
  categories: ['cartesian', 'symbols', 'showLegend'],
  schema: scatterSchema,
  meta: { description: 'Test scatter.', docsPage: 'scatter' },
  supplyDefaults(_traceIn, _out, ctx) {
    const x = ctx.coerce<ArrayLike<unknown> | undefined>('x');
    const y = ctx.coerce<ArrayLike<unknown> | undefined>('y');
    const len = Math.min(x?.length ?? Infinity, y?.length ?? Infinity);
    const mode = ctx.coerce<string>('mode', len < 20 ? 'lines+markers' : 'lines');
    const flags = mode.split('+');
    if (flags.includes('lines')) {
      ctx.coerce('line.color', ctx.defaultColor);
      ctx.coerce('line.width');
      ctx.coerce('line.dash');
    }
    if (flags.includes('markers')) {
      ctx.coerce('marker.color', ctx.defaultColor);
      ctx.coerce('marker.size');
      ctx.coerce('marker.symbol');
      ctx.coerce('marker.opacity');
      ctx.coerceContainer('marker.line');
    }
    if (flags.includes('text')) {
      ctx.coerce('text');
      const f = ctx.fullLayout.font;
      ctx.coerceContainer('textfont', {
        family: f.family,
        size: f.size,
        color: f.color,
        weight: f.weight,
        style: f.style,
      });
    }
  },
};

/** Mini bar with a module-owned layout attribute (`barmode`). */
export const barSchema = attr.object({
  x: attr.dataArray({ editType: 'calc' }),
  y: attr.dataArray({ editType: 'calc' }),
  orientation: attr.enumerated({ values: ['v', 'h'], dflt: 'v', editType: 'calc' }),
  marker: attr.object(
    {
      color: attr.color({ arrayOk: true, editType: 'style' }),
      line: markerLine,
    },
    { editType: 'calc' },
  ),
});

export const bar: TraceModule<typeof barSchema.children> = {
  type: 'bar',
  categories: ['cartesian', 'showLegend'],
  schema: barSchema,
  meta: { description: 'Test bar.', plotlyEquivalent: 'bar' },
  layoutSchema: {
    barmode: attr.enumerated({
      values: ['group', 'stack', 'overlay', 'relative'],
      dflt: 'group',
      editType: 'crossTraceCalc',
    }),
    bargap: attr.number({ min: 0, max: 1, dflt: 0.2, editType: 'calc' }),
  },
  supplyDefaults(_traceIn, _out, ctx) {
    ctx.coerce('x');
    ctx.coerce('y');
    ctx.coerce('orientation');
    ctx.coerce('marker.color', ctx.defaultColor);
    ctx.coerceContainer('marker.line');
  },
};

/** Mini non-cartesian trace (no axes, no legend). */
export const gauge: TraceModule = {
  type: 'gauge',
  categories: [],
  schema: attr.object({ value: attr.number({ dflt: 0, editType: 'calc' }) }),
  meta: { description: 'Test domain trace.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('value');
  },
};

/** Mini annotations component, exercising item arrays and `templateitemname`. */
export const annotations: ComponentModule = {
  name: 'annotations',
  layoutSchema: {
    annotations: attr.items(
      {
        visible: attr.boolean({ dflt: true }),
        text: attr.string({ dflt: '' }),
        x: attr.any({ dflt: 0 }),
        y: attr.any({ dflt: 0 }),
        opacity: attr.number({ min: 0, max: 1, dflt: 1 }),
        font: attr.object({ size: attr.number({ min: 1, dflt: 12 }), color: attr.color() }),
      },
      { itemName: 'annotation', editType: ['plot'] },
    ),
  },
};

/** A registry with every fixture registered. */
export function fixtureRegistry(): Registry {
  return createRegistry().register(scatter, bar, gauge).registerComponent(annotations);
}
