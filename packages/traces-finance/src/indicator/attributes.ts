/**
 * `indicator` attribute schema (plan E12.7, ADR-002), following plotly.js
 * `traces/indicator/attributes.js`. `domain` comes from the registry (the trace is in the `domain`
 * category); `name`, `meta`, … are common trace attributes.
 *
 * The gauge axis reuses the cartesian axis declarations of its tick attributes (as polar does).
 *
 * Deferred: the axis `labelalias` (not implemented by any axis yet), the font `variant` /
 * `textcase` / `lineposition` / `shadow` fields, and the 3D-native gauge `depth` / `material` (P2).
 */
import { attr, xaxisSchema, type Children, type SchemaNode } from '@mk7s/holochart-core';
import { DECREASING_COLOR, INCREASING_COLOR } from '../shared/attributes.ts';

/** Plotly's `colorAttrs.defaultLine`. */
export const DEFAULT_LINE = '#444';

/** Font of the number, the delta, the title and the tick labels. */
function font(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'plot',
        description: 'CSS font-family list.',
      }),
      size: attr.number({ min: 1, editType: 'plot', description: 'Font size in CSS px.' }),
      color: attr.color({ editType: 'plot', description: 'Text color.' }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        editType: 'plot',
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        editType: 'plot',
        description: 'Font style.',
      }),
    },
    { editType: 'plot', description },
  );
}

/** A `[min, max]` range of gauge axis values. */
function range(description: string) {
  return attr.infoArray({
    items: [attr.number({ editType: 'plot' }), attr.number({ editType: 'plot' })],
    editType: 'plot',
    description,
  });
}

/** Plotly's `gaugeBarAttrs`: a colored band of the gauge with an outline. */
function band(what: string, color: string | undefined, thickness: number) {
  return {
    color: attr.color({
      ...(color !== undefined ? { dflt: color } : {}),
      editType: 'plot',
      description: `Fill color of the ${what}.`,
    }),
    line: attr.object(
      {
        color: attr.color({
          dflt: DEFAULT_LINE,
          editType: 'plot',
          description: `Outline color of the ${what}.`,
        }),
        width: attr.number({
          min: 0,
          dflt: 0,
          editType: 'plot',
          description: `Outline width of the ${what} in CSS px (centered on its edge).`,
        }),
      },
      { editType: 'plot', description: `Outline of the ${what}.` },
    ),
    thickness: attr.number({
      min: 0,
      max: 1,
      dflt: thickness,
      editType: 'plot',
      description: `Thickness of the ${what} as a fraction of the gauge's thickness, centered on it.`,
    }),
  };
}

/** A copy of a cartesian axis attribute with `editType: 'plot'` (and a new default). */
function tick(key: string, dflt?: unknown): SchemaNode {
  const node = (xaxisSchema.children as Children)[key] as SchemaNode;
  const plot = (n: SchemaNode): SchemaNode => {
    if (n.kind === 'attr') return { ...n, editType: 'plot' };
    if (n.kind === 'items') return { ...n, editType: 'plot', item: plot(n.item) as typeof n.item };
    const children: Record<string, SchemaNode> = {};
    for (const [k, v] of Object.entries(n.children)) children[k] = plot(v);
    return { ...n, editType: 'plot', children };
  };
  const out = plot(node);
  return dflt !== undefined && out.kind === 'attr' ? { ...out, dflt } : out;
}

/** Tick attributes of the gauge axis, named and working as on cartesian axes. */
const TICKS = [
  'nticks',
  'tick0',
  'dtick',
  'tickvals',
  'ticktext',
  'ticklen',
  'tickwidth',
  'ticklabelstep',
  'showticklabels',
  'tickangle',
  'tickformat',
  'tickformatstops',
  'tickprefix',
  'showtickprefix',
  'ticksuffix',
  'showticksuffix',
  'separatethousands',
  'exponentformat',
  'minexponent',
  'showexponent',
] as const;

/** The indicator schema. */
// A pure IIFE, so bundles without this trace drop the whole schema: a package ships as one file,
// where top-level `attr.*()` calls would otherwise look side-effectful (E21.6).
export const indicatorAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      mode: attr.flaglist({
        flags: ['number', 'delta', 'gauge'],
        dflt: 'number',
        editType: 'calc',
        description:
          'What shows the value: `number` (the value as text), `delta` (its difference to `delta.reference` as text) and / or `gauge` (the value on an angular or bullet gauge).',
      }),
      value: attr.number({
        editType: 'calc',
        animatable: true,
        description:
          'The value to show. Transitions (`layout.transition`, `animate`) count the number up and move the gauge bar.',
      }),
      align: attr.enumerated({
        values: ['left', 'center', 'right'],
        editType: 'plot',
        description:
          'Horizontal alignment of the number and delta in the domain. No effect with an angular gauge, where they are always centered. Default `center`.',
      }),
      title: attr.object(
        {
          text: attr.string({
            editType: 'plot',
            description: 'Title of the indicator (Plotly pseudo-HTML allowed).',
          }),
          align: attr.enumerated({
            values: ['left', 'center', 'right'],
            editType: 'plot',
            description:
              'Horizontal alignment of the title in the domain. Default `center`; a bullet gauge puts its title to the left of the domain, right-aligned.',
          }),
          font: font('Title font. Defaults to `layout.font` at a quarter of the number font size.'),
        },
        { editType: 'plot', description: 'The indicator title.' },
      ),
      number: attr.object(
        {
          valueformat: attr.string({
            dflt: '',
            editType: 'plot',
            description:
              'd3-format specifier of the number. Default: rounded like a tick label of an axis from 0 to 1.5 times the value (or the gauge axis).',
          }),
          font: font(
            'Font of the number. Defaults to `layout.font`; without a `size`, the number (and the delta) scale to fit the domain.',
          ),
          prefix: attr.string({
            dflt: '',
            editType: 'plot',
            description: 'Text before the number.',
          }),
          suffix: attr.string({
            dflt: '',
            editType: 'plot',
            description: 'Text after the number.',
          }),
        },
        { editType: 'plot', description: 'The number (`mode` with `number`).' },
      ),
      delta: attr.object(
        {
          reference: attr.number({
            editType: 'calc',
            animatable: true,
            description: 'The reference the delta is computed from. Default: `value`.',
          }),
          position: attr.enumerated({
            values: ['top', 'bottom', 'left', 'right'],
            dflt: 'bottom',
            editType: 'plot',
            description: 'Where the delta goes relative to the number.',
          }),
          relative: attr.boolean({
            dflt: false,
            editType: 'plot',
            description: 'Show the relative change `(value − reference) / reference`.',
          }),
          valueformat: attr.string({
            editType: 'plot',
            description:
              "d3-format specifier of the delta. Default `'2%'` (a percentage, trailing zeros trimmed) when `relative`, else rounded like the number.",
          }),
          increasing: attr.object(
            {
              symbol: attr.string({
                dflt: '▲',
                editType: 'plot',
                description: 'Symbol before a positive delta.',
              }),
              color: attr.color({
                dflt: INCREASING_COLOR,
                editType: 'plot',
                description: 'Color of a positive (or zero) delta.',
              }),
            },
            { editType: 'plot', description: 'Style of a positive delta.' },
          ),
          decreasing: attr.object(
            {
              symbol: attr.string({
                dflt: '▼',
                editType: 'plot',
                description: 'Symbol before a negative delta.',
              }),
              color: attr.color({
                dflt: DECREASING_COLOR,
                editType: 'plot',
                description: 'Color of a negative delta.',
              }),
            },
            { editType: 'plot', description: 'Style of a negative delta.' },
          ),
          font: font(
            'Font of the delta. Defaults to `layout.font`, at half the number font size (or the number font size without a number).',
          ),
          prefix: attr.string({
            dflt: '',
            editType: 'plot',
            description: 'Text between the symbol and the delta.',
          }),
          suffix: attr.string({
            dflt: '',
            editType: 'plot',
            description: 'Text after the delta.',
          }),
        },
        { editType: 'calc', description: 'The delta (`mode` with `delta`).' },
      ),
      gauge: attr.object(
        {
          shape: attr.enumerated({
            values: ['angular', 'bullet'],
            dflt: 'angular',
            editType: 'plot',
            description:
              'Gauge shape: `angular` (a half ring with the number in its middle) or `bullet` (a horizontal bar, the number to its right).',
          }),
          bar: attr.object(band('value bar', 'green', 1), {
            editType: 'calc',
            description:
              "The bar from the start of the axis to the value. Default thickness 0.5 (0.25 on a bullet gauge) of the gauge's.",
          }),
          bgcolor: attr.color({
            editType: 'plot',
            description: 'Gauge background color. Default: `layout.paper_bgcolor`.',
          }),
          bordercolor: attr.color({
            dflt: DEFAULT_LINE,
            editType: 'plot',
            description: 'Color of the gauge outline.',
          }),
          borderwidth: attr.number({
            min: 0,
            dflt: 1,
            editType: 'plot',
            description: 'Width of the gauge outline in CSS px.',
          }),
          axis: attr.object(
            {
              range: attr.infoArray({
                // `null` items take the default's (Plotly's `[null, 500]` idiom).
                items: [attr.any({ dflt: null }), attr.any({ dflt: null })],
                editType: 'plot',
                description:
                  'Values at the start and end of the gauge; a `null` end keeps its default. Default `[0, 1.5 × value]`.',
              }),
              visible: attr.boolean({
                dflt: true,
                editType: 'plot',
                description: 'Show the axis ticks and tick labels.',
              }),
              tickmode: attr.enumerated({
                values: ['auto', 'linear', 'array'],
                editType: 'plot',
                description:
                  '`auto` picks up to `nticks` round ticks; `linear` places ticks from `tick0` every `dtick`; `array` uses `tickvals`/`ticktext`. Defaults to `array` when `tickvals` is set, `linear` when `dtick` is set, else `auto`.',
              }),
              ...Object.fromEntries(TICKS.map((k) => [k, tick(k)])),
              ticks: attr.enumerated({
                values: ['outside', 'inside', ''],
                dflt: 'outside',
                editType: 'plot',
                description: "Draw tick marks outside or inside the gauge, or not at all (`''`).",
              }),
              tickcolor: attr.color({
                dflt: DEFAULT_LINE,
                editType: 'plot',
                description: 'Tick color.',
              }),
              tickfont: font('Tick-label font. Defaults to `layout.font`.'),
            },
            { editType: 'plot', description: 'The gauge axis: its range, ticks and tick labels.' },
          ),
          steps: attr.items(
            { ...band('step', undefined, 1), range: range('Axis values the step spans.') },
            {
              itemName: 'step',
              editType: 'plot',
              description:
                'Colored bands of the gauge (ranges such as "good" / "bad"), drawn under the value bar.',
            },
          ),
          threshold: attr.object(
            {
              line: attr.object(
                {
                  color: attr.color({
                    dflt: DEFAULT_LINE,
                    editType: 'plot',
                    description: 'Color of the threshold line.',
                  }),
                  width: attr.number({
                    min: 0,
                    dflt: 1,
                    editType: 'plot',
                    description: 'Width of the threshold line in CSS px.',
                  }),
                },
                { editType: 'plot', description: 'The threshold line.' },
              ),
              thickness: attr.number({
                min: 0,
                max: 1,
                dflt: 0.85,
                editType: 'plot',
                description:
                  "Length of the threshold line as a fraction of the gauge's thickness, centered on it.",
              }),
              value: attr.number({
                editType: 'calc',
                description: 'Axis value marked by a line across the gauge. Unset: no line.',
              }),
            },
            { editType: 'plot', description: 'A line marking a threshold value on the gauge.' },
          ),
        },
        { editType: 'plot', description: 'The gauge (`mode` with `gauge`).' },
      ),
    },
    {
      description:
        'A single value as a big number, its delta to a reference, and / or a gauge (angular or bullet) with colored steps and a threshold.',
    },
  ))();
