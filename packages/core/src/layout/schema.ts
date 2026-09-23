/**
 * Layout attribute schema — the M0 subset (plan E1.4 / E1.9 scope).
 *
 * Axis containers here are deliberately minimal (`type`, `range`, `autorange`, `domain`,
 * `anchor`): enough for subplot discovery. The full axis schema (ticks, grids, titles, …) arrives
 * with E3. Trace modules and components add their own layout attributes through the registry.
 */
import { attr } from '../schema/attr.ts';

/** Transition easing names (Plotly-compatible). */
export const EASINGS = [
  'linear',
  'quad',
  'cubic',
  'sin',
  'exp',
  'circle',
  'elastic',
  'back',
  'bounce',
  'linear-in',
  'quad-in',
  'cubic-in',
  'sin-in',
  'exp-in',
  'circle-in',
  'elastic-in',
  'back-in',
  'bounce-in',
  'linear-out',
  'quad-out',
  'cubic-out',
  'sin-out',
  'exp-out',
  'circle-out',
  'elastic-out',
  'back-out',
  'bounce-out',
  'linear-in-out',
  'quad-in-out',
  'cubic-in-out',
  'sin-in-out',
  'exp-in-out',
  'circle-in-out',
  'elastic-in-out',
  'back-in-out',
  'bounce-in-out',
] as const;

/** The default Plotly/D3 category10 colorway. */
export const DEFAULT_COLORWAY = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
] as const;

/** Default font family stack. */
export const DEFAULT_FONT_FAMILY = '"Open Sans", verdana, arial, sans-serif';

/**
 * Font attributes without defaults. Containers like `title.font` inherit unset fields from
 * `layout.font` during supply-defaults.
 */
export function fontSchema(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        description:
          'CSS font-family list. The renderer uses the first family it can load and falls back through the list.',
      }),
      size: attr.number({ min: 1, description: 'Font size in CSS pixels.' }),
      color: attr.color({ description: 'Text color.', editType: 'style' }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        description: 'Font style.',
      }),
    },
    { description, editType: ['layout', 'plot'] },
  );
}

function axisSchema<const L extends 'x' | 'y'>(letter: L) {
  // Cast keeps the literal counterpart ('y' for x axes) so inferred anchor types stay exact.
  const other = (letter === 'x' ? 'y' : 'x') as L extends 'x' ? 'y' : 'x';
  return attr.subplotObject(
    letter,
    {
      type: attr.enumerated({
        values: ['-', 'linear', 'log', 'date', 'category', 'multicategory'],
        dflt: '-',
        editType: 'calc',
        description:
          "Axis type. `'-'` detects the type from the data of the first trace on this axis.",
      }),
      autorange: attr.enumerated({
        values: [true, false, 'reversed'],
        dflt: true,
        editType: ['layout', 'ticks', 'plot'],
        description:
          'Whether the range is computed from the data. Defaults to `false` when a valid `range` is given.',
      }),
      range: attr.infoArray({
        items: [attr.any(), attr.any()],
        editType: ['ticks', 'plot'],
        animatable: true,
        description:
          'Visible range `[start, end]` in data units (numbers, dates or category names). Setting it turns `autorange` off.',
      }),
      domain: attr.infoArray({
        items: [attr.number({ min: 0, max: 1, dflt: 0 }), attr.number({ min: 0, max: 1, dflt: 1 })],
        dflt: [0, 1],
        editType: 'layout',
        description: 'Fraction of the plot area `[start, end]` this axis spans.',
      }),
      anchor: attr.subplotId({
        dflt: other,
        extras: ['free'],
        editType: 'layout',
        description: `The ${other} axis this axis is drawn against, or \`free\`. Defaults to the ${other} axis of the first subplot using this axis.`,
      }),
    },
    {
      editType: 'calc',
      description: `A ${letter} axis. \`${letter}axis2\`, \`${letter}axis3\`, … declare further ${letter} axes, referenced from traces as \`'${letter}2'\`, \`'${letter}3'\`, ….`,
      role: 'layout',
    },
  );
}

/** Minimal x-axis schema (full axis schema: E3). */
export const xaxisSchema = axisSchema('x');
/** Minimal y-axis schema (full axis schema: E3). */
export const yaxisSchema = axisSchema('y');

/** The base layout schema. Registry-merged with trace-module and component layout attributes. */
export const layoutSchema = attr.object(
  {
    width: attr.number({
      min: 10,
      dflt: 700,
      editType: 'layout',
      description: 'Figure width in CSS pixels. Ignored when `autosize` fills the container.',
    }),
    height: attr.number({
      min: 10,
      dflt: 450,
      editType: 'layout',
      description: 'Figure height in CSS pixels. Ignored when `autosize` fills the container.',
    }),
    autosize: attr.boolean({
      dflt: false,
      editType: 'layout',
      description:
        'Size the figure to its container on first render (and on resize with `config.responsive`).',
    }),
    margin: attr.object(
      {
        l: attr.number({ min: 0, dflt: 80, description: 'Left margin in CSS pixels.' }),
        r: attr.number({ min: 0, dflt: 80, description: 'Right margin in CSS pixels.' }),
        t: attr.number({ min: 0, dflt: 100, description: 'Top margin in CSS pixels.' }),
        b: attr.number({ min: 0, dflt: 80, description: 'Bottom margin in CSS pixels.' }),
        pad: attr.number({
          min: 0,
          dflt: 0,
          description: 'Padding between the plot area and the axis lines, in CSS pixels.',
        }),
        autoexpand: attr.boolean({
          dflt: true,
          description: 'Let components (legend, colorbars, automargin axes) grow the margins.',
        }),
      },
      { editType: 'layout', description: 'Space around the plot area.' },
    ),
    paper_bgcolor: attr.color({
      dflt: '#fff',
      editType: 'style',
      description: 'Background color of the whole figure.',
    }),
    plot_bgcolor: attr.color({
      dflt: '#fff',
      editType: 'style',
      description: 'Background color of the plot area between the axes.',
    }),
    font: attr.object(
      {
        family: attr.string({
          noBlank: true,
          strict: true,
          dflt: DEFAULT_FONT_FAMILY,
          description: 'CSS font-family list used by every text element unless overridden.',
        }),
        size: attr.number({ min: 1, dflt: 12, description: 'Base font size in CSS pixels.' }),
        color: attr.color({ dflt: '#444', editType: 'style', description: 'Base text color.' }),
        weight: attr.integer({
          min: 1,
          max: 1000,
          extras: ['normal', 'bold'],
          dflt: 'normal',
          description: 'Base font weight.',
        }),
        style: attr.enumerated({
          values: ['normal', 'italic'],
          dflt: 'normal',
          description: 'Base font style.',
        }),
      },
      {
        editType: ['layout', 'plot'],
        description: 'Global font. Every text element inherits unset font fields from here.',
      },
    ),
    colorway: attr.colorlist({
      dflt: DEFAULT_COLORWAY,
      editType: ['style', 'legend'],
      description: 'Default trace colors, cycled by trace index.',
    }),
    template: attr.any({
      editType: 'calc',
      description:
        "Template: a registered name (`'dark'`), a `+`-composition (`'dark+presentation'`) or an object `{ layout, data }`. `null` disables the default template.",
    }),
    title: attr.object(
      {
        text: attr.string({
          dflt: '',
          description: 'Title text (supports rich-text tags, E2.10).',
        }),
        font: fontSchema('Title font. Defaults to `layout.font` with 1.4× size.'),
        x: attr.number({
          min: 0,
          max: 1,
          dflt: 0.5,
          description: 'Horizontal position in `xref` coordinates.',
        }),
        y: attr.number({
          min: 0,
          max: 1,
          extras: ['auto'],
          dflt: 'auto',
          description:
            'Vertical position in `yref` coordinates. `auto` places it in the top margin.',
        }),
        xref: attr.enumerated({
          values: ['container', 'paper'],
          dflt: 'container',
          description: '`container` spans the whole figure; `paper` spans the plot area.',
        }),
        yref: attr.enumerated({
          values: ['container', 'paper'],
          dflt: 'container',
          description: '`container` spans the whole figure; `paper` spans the plot area.',
        }),
        xanchor: attr.enumerated({
          values: ['auto', 'left', 'center', 'right'],
          dflt: 'auto',
          description: 'Horizontal alignment of the title box relative to `x`.',
        }),
        yanchor: attr.enumerated({
          values: ['auto', 'top', 'middle', 'bottom'],
          dflt: 'auto',
          description: 'Vertical alignment of the title box relative to `y`.',
        }),
      },
      { editType: ['layout', 'plot'], description: 'Figure title.' },
    ),
    showlegend: attr.boolean({
      editType: ['legend', 'layout'],
      description:
        'Show the legend. Defaults to `true` when more than one trace has a legend entry.',
    }),
    hovermode: attr.enumerated({
      values: ['x', 'y', 'closest', false, 'x unified', 'y unified'],
      dflt: 'closest',
      editType: 'modebar',
      description:
        'How hover picks points: nearest point, all points at the same x/y, or unified labels.',
    }),
    dragmode: attr.enumerated({
      values: ['zoom', 'pan', 'select', 'lasso', 'orbit', 'turntable', false],
      dflt: 'zoom',
      editType: 'modebar',
      description: 'What dragging on the plot area does.',
    }),
    transition: attr.object(
      {
        duration: attr.number({
          min: 0,
          dflt: 500,
          description: 'Transition duration in milliseconds.',
        }),
        easing: attr.enumerated({
          values: EASINGS,
          dflt: 'cubic-in-out',
          description: 'Easing function.',
        }),
        ordering: attr.enumerated({
          values: ['layout first', 'traces first'],
          dflt: 'layout first',
          description: 'Whether layout or trace changes animate first.',
        }),
      },
      { editType: 'none', description: 'Default transition for animated updates (E7.3).' },
    ),
    uirevision: attr.any({
      editType: 'none',
      description:
        'While unchanged across updates, user interaction state (zoom, legend toggles, selections) is preserved.',
    }),
    datarevision: attr.any({
      editType: 'calc',
      description: 'Change this to force data arrays to be re-read when they are mutated in place.',
    }),
    meta: attr.any({
      arrayOk: true,
      editType: 'plot',
      description: 'Arbitrary user data, available in text templates as `%{meta}`.',
    }),
    xaxis: xaxisSchema,
    yaxis: yaxisSchema,
  },
  { editType: 'calc', description: 'Figure layout.' },
);
