/**
 * `scatter` attribute schema (plan E9.1–E9.3, E9.7, ADR-002): the single source of truth for the
 * trace's types, validation, defaults, edit types and docs. Names and semantics follow plotly.js
 * `traces/scatter/attributes.js`.
 *
 * Edit types decide how much work an update costs: anything that moves points or changes the
 * autorange padding is `calc`; what only re-reads the trace when drawing (line shape, text) is
 * `plot`; colors, widths and opacities are `style` (buffer or uniform updates only).
 *
 * Not yet declared (deferred): `marker.gradient`, `marker.angleref`, `marker.standoff`,
 * `marker.colorbar` (wave 3, with the colorbar component), `line.backoff`, fills (E9.4) and
 * `hoveron`.
 */
import { attr, type Primitive } from '@mk7s/holochart-core';
import { MARKER_SYMBOLS, SYMBOL_VARIANTS } from '@mk7s/holochart-render';
import { colorscaleAttributes } from '../shared/colorscale.ts';
import { errorBarAttributes } from '../shared/error-bars/index.ts';
import { TEXT_POSITIONS } from './text-position.ts';

/**
 * Every accepted `marker.symbol` value, as in Plotly: names with variant suffixes
 * (`'diamond-open-dot'`), numeric codes (`102`) and numeric strings (`'102'`).
 */
export const SCATTER_SYMBOLS: readonly Primitive[] = MARKER_SYMBOLS.flatMap((def) =>
  SYMBOL_VARIANTS.flatMap((suffix, variant) => {
    const code = def.code + 100 * variant;
    return [def.name + suffix, code, String(code)];
  }),
);

/** `line.shape` values (plotly.js). */
export const LINE_SHAPES = ['linear', 'spline', 'hv', 'vh', 'hvh', 'vhv'] as const;

const coordinate = (letter: 'x' | 'y') =>
  ({
    data: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description: `${letter} coordinates: numbers, dates or category names depending on the axis type.`,
    }),
    start: attr.any({
      dflt: 0,
      editType: 'calc',
      description: `Starting ${letter} coordinate when \`${letter}\` is not given: point \`i\` is at \`${letter}0 + i·d${letter}\`.`,
    }),
    step: attr.number({
      dflt: 1,
      editType: 'calc',
      description: `Step between implicit ${letter} coordinates (see \`${letter}0\`).`,
    }),
    period: attr.any({
      editType: 'calc',
      description: `Only on date or linear ${letter} axes: snap each ${letter} value to its period of this length (ms, or \`'M<n>'\` months on date axes), positioned per \`${letter}periodalignment\`.`,
    }),
    period0: attr.any({
      editType: 'calc',
      description: `A period boundary for \`${letter}period\`. Default: 2000-01-01 on date axes (a Sunday for weekly periods), 0 otherwise.`,
    }),
    periodalignment: attr.enumerated({
      values: ['start', 'middle', 'end'],
      dflt: 'middle',
      editType: 'calc',
      description: `Where points sit within their \`${letter}period\`.`,
    }),
  }) as const;

const X = coordinate('x');
const Y = coordinate('y');

/** Plotly's `textfont` for scatter: every field may be one value per point. */
const textfont = attr.object(
  {
    family: attr.string({
      noBlank: true,
      strict: true,
      arrayOk: true,
      editType: 'plot',
      description: 'CSS font family of the text labels, or one per point.',
    }),
    size: attr.number({
      min: 1,
      arrayOk: true,
      editType: 'plot',
      description: 'Font size in CSS px, or one per point.',
    }),
    color: attr.color({
      arrayOk: true,
      editType: 'style',
      description: 'Text color, or one per point.',
    }),
    weight: attr.integer({
      min: 1,
      max: 1000,
      extras: ['normal', 'bold'],
      editType: 'plot',
      description: 'Font weight: a CSS numeric weight, `normal` or `bold`.',
    }),
    style: attr.enumerated({
      values: ['normal', 'italic'],
      editType: 'plot',
      description: 'Font style.',
    }),
  },
  {
    editType: 'plot',
    description: 'Font of the text labels (`mode` `text`). Defaults to `layout.font`.',
  },
);

/** `selected` / `unselected` point styles (E6.3). */
const selectionStyle = (which: 'selected' | 'unselected') =>
  attr.object(
    {
      marker: attr.object(
        {
          opacity: attr.number({
            min: 0,
            max: 1,
            editType: 'style',
            description: `Marker opacity of ${which} points.${which === 'unselected' ? ' Default: 0.2 × the marker opacity when no selected/unselected opacity is set.' : ''}`,
          }),
          color: attr.color({
            editType: 'style',
            description: `Marker color of ${which} points.`,
          }),
          size: attr.number({
            min: 0,
            editType: 'style',
            description: `Marker size (px) of ${which} points.`,
          }),
        },
        { editType: 'style' },
      ),
      textfont: attr.object(
        {
          color: attr.color({
            editType: 'style',
            description: `Text color of ${which} points.`,
          }),
        },
        { editType: 'style' },
      ),
    },
    {
      editType: 'style',
      description: `Style of ${which} points while a selection is active (box/lasso select, \`selectedpoints\`).`,
    },
  );

/** The scatter schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
export const scatterAttributes = attr.object(
  {
    x: X.data,
    x0: X.start,
    dx: X.step,
    xperiod: X.period,
    xperiod0: X.period0,
    xperiodalignment: X.periodalignment,
    y: Y.data,
    y0: Y.start,
    dy: Y.step,
    yperiod: Y.period,
    yperiod0: Y.period0,
    yperiodalignment: Y.periodalignment,
    mode: attr.flaglist({
      flags: ['lines', 'markers', 'text'],
      extras: ['none'],
      editType: 'calc',
      description:
        "Drawing mode. Defaults to `'lines+markers'` below 20 points, else `'lines'` (Plotly rule).",
    }),
    text: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'plot',
      description: 'Text per point: the labels of `mode` `text`, and hover text.',
    }),
    texttemplate: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'plot',
      description:
        "Template for the text labels, e.g. `'%{y:.2f}'` or `'%{x|%b %d}'` (d3-format / d3-time-format after `:` / `|`). Keys: `x`, `y`, `text`, `customdata`, `marker.size`, `marker.color`, `meta`. Overrides `text`.",
    }),
    textposition: attr.enumerated({
      values: TEXT_POSITIONS,
      dflt: 'middle center',
      arrayOk: true,
      editType: 'plot',
      description: 'Where text labels sit relative to their point (and marker), or one per point.',
    }),
    textfont,
    line: attr.object(
      {
        color: attr.color({
          editType: 'style',
          description:
            'Line color. Defaults to the marker color (when a single color) or the colorway.',
        }),
        width: attr.number({
          min: 0,
          dflt: 2,
          editType: 'style',
          description: 'Line width in CSS px.',
        }),
        dash: attr.string({
          dflt: 'solid',
          editType: 'style',
          description:
            "Dash style: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a dash list such as `'5px,10px,2px'`.",
        }),
        shape: attr.enumerated({
          values: LINE_SHAPES,
          dflt: 'linear',
          editType: 'plot',
          description:
            "Interpolation between points: straight, `'spline'` (centripetal Catmull-Rom, see `smoothing`), or steps (`'hv'`: horizontal then vertical, …).",
        }),
        smoothing: attr.number({
          min: 0,
          max: 1.3,
          dflt: 1,
          editType: 'plot',
          description: "Spline tension for `shape: 'spline'`: 0 is straight, 1.3 the smoothest.",
        }),
        simplify: attr.boolean({
          dflt: true,
          editType: 'plot',
          description:
            'Decimate dense monotonic lines to at most 4 vertices per pixel column (min/max, visually lossless). Recomputed when zooming changes the scale.',
        }),
      },
      { editType: 'plot', description: 'Line style (`mode` `lines`).' },
    ),
    connectgaps: attr.boolean({
      dflt: false,
      editType: 'plot',
      description: 'Connect lines across missing (`null`, `NaN`) points instead of breaking them.',
    }),
    marker: attr.object(
      {
        color: attr.color({
          arrayOk: true,
          editType: 'style',
          animatable: true,
          description:
            'Marker fill color, one CSS color per point, or numbers mapped through `colorscale`. Defaults to the colorway.',
        }),
        ...colorscaleAttributes({ colorAttr: 'marker.color', showscale: true, coloraxis: true }),
        size: attr.number({
          min: 0,
          dflt: 6,
          arrayOk: true,
          // Sizes pad the autorange, so they invalidate calc (extremes), like Plotly.
          editType: 'calc',
          animatable: true,
          description:
            'Marker diameter in CSS px, or one value per point (scaled by `sizeref`/`sizemode`).',
        }),
        sizemode: attr.enumerated({
          values: ['diameter', 'area'],
          dflt: 'diameter',
          editType: 'calc',
          description:
            'How per-point `size` values become px: proportional to the diameter or to the area (bubble charts).',
        }),
        sizeref: attr.number({
          dflt: 1,
          editType: 'calc',
          description: 'Divides per-point `size` values (bubble charts; see `sizemode`).',
        }),
        sizemin: attr.number({
          min: 0,
          dflt: 0,
          editType: 'calc',
          description: 'Minimum radius (px) of markers with per-point `size` values.',
        }),
        symbol: attr.enumerated({
          values: SCATTER_SYMBOLS,
          dflt: 'circle',
          arrayOk: true,
          editType: 'style',
          description:
            "Marker symbol: a name (`'diamond-open'`), a Plotly numeric code, or one per point.",
        }),
        opacity: attr.number({
          min: 0,
          max: 1,
          arrayOk: true,
          editType: 'style',
          animatable: true,
          description:
            'Marker opacity (multiplied by the trace `opacity`), or one per point. Default 1, 0.7 for bubbles.',
        }),
        angle: attr.angle({
          dflt: 0,
          arrayOk: true,
          editType: 'style',
          description: 'Marker rotation in degrees, clockwise, or one per point.',
        }),
        maxdisplayed: attr.number({
          min: 0,
          dflt: 0,
          editType: 'plot',
          description:
            'Draw at most this many markers (evenly strided over the data); 0 draws all.',
        }),
        line: attr.object(
          {
            color: attr.color({
              arrayOk: true,
              editType: 'style',
              description:
                'Marker outline color, one per point, or numbers mapped through its `colorscale`.',
            }),
            ...colorscaleAttributes({
              colorAttr: 'marker.line.color',
              showscale: false,
              coloraxis: true,
            }),
            width: attr.number({
              min: 0,
              arrayOk: true,
              editType: 'style',
              description:
                'Marker outline width in CSS px, or one per point. Default 0, 1 for bubbles.',
            }),
          },
          { editType: 'style', description: 'Marker outline.' },
        ),
      },
      { editType: 'calc', description: 'Marker style (`mode` `markers`).' },
    ),
    selected: selectionStyle('selected'),
    unselected: selectionStyle('unselected'),
    error_x: errorBarAttributes('x'),
    error_y: errorBarAttributes('y'),
    zorder: attr.integer({
      dflt: 0,
      editType: 'plot',
      description:
        'Stacking order among the traces of a subplot: higher is drawn on top; ties keep trace order.',
    }),
  },
  { description: 'Scatter: markers, lines and text labels at x/y positions.' },
);
