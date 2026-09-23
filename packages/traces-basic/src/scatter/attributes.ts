/**
 * `scatter` attribute schema (plan E9.1, ADR-002): the single source of truth for the trace's
 * types, validation, defaults, edit types and docs.
 *
 * M1 wave 1 covers markers mode. `mode` already declares `lines` and `text` (and the Plotly default
 * rule uses them) so that lines (E9.2), text (E9.3), fills (E9.4) and error bars (E9.7) extend this
 * schema without changing existing attributes.
 */
import { attr, type Primitive } from '@mk7s/holochart-core';
import { MARKER_SYMBOLS, SYMBOL_VARIANTS } from '@mk7s/holochart-render';

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
  }) as const;

const X = coordinate('x');
const Y = coordinate('y');

/** The scatter schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
export const scatterAttributes = attr.object(
  {
    x: X.data,
    x0: X.start,
    dx: X.step,
    y: Y.data,
    y0: Y.start,
    dy: Y.step,
    mode: attr.flaglist({
      flags: ['lines', 'markers', 'text'],
      extras: ['none'],
      editType: 'calc',
      description:
        "Drawing mode. Defaults to `'lines+markers'` below 20 points, else `'lines'` (Plotly rule). Wave 1 draws markers only.",
    }),
    text: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'calc',
      description: 'Text per point (hover labels, and `mode` `text`).',
    }),
    marker: attr.object(
      {
        color: attr.color({
          arrayOk: true,
          editType: 'style',
          animatable: true,
          description: 'Marker fill color, or one CSS color per point. Defaults to the colorway.',
        }),
        size: attr.number({
          min: 0,
          dflt: 6,
          arrayOk: true,
          // Sizes pad the autorange, so they invalidate calc (extremes), like Plotly.
          editType: 'calc',
          animatable: true,
          description: 'Marker diameter in CSS px, or one per point.',
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
          description: 'Marker opacity (multiplied by the trace `opacity`), or one per point.',
        }),
        line: attr.object(
          {
            color: attr.color({
              arrayOk: true,
              editType: 'style',
              description: 'Marker outline color, or one per point.',
            }),
            width: attr.number({
              min: 0,
              dflt: 0,
              arrayOk: true,
              editType: 'style',
              description: 'Marker outline width in CSS px, or one per point.',
            }),
          },
          { editType: 'style', description: 'Marker outline.' },
        ),
      },
      { editType: 'calc', description: 'Marker style.' },
    ),
  },
  { description: 'Scatter: points (markers) at x/y positions.' },
);
