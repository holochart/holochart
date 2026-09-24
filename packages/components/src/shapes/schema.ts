/**
 * `layout.shapes[]` attributes and defaults (plan E5.5), following Plotly's shapes: lines,
 * rectangles, ellipses and SVG paths in data, axis-domain or paper coordinates, with optional
 * pixel sizing and a text label.
 */
import { attr, fontSchema, type FullLayout } from '@mk7s/holochart-core';
import { inheritFont, type FullFont } from '../shared/text.ts';

/** Shapes only redraw (no margins; a transform when axes move). */
const SHAPE_EDIT = ['plot'] as const;

const REF =
  "`'paper'` (0–1 across the plot area), an axis id (`'x'`, `'x2'`: data units of that axis — on log axes data values, not exponents; on category axes names or fractional indices) or `'<axis> domain'` (0–1 across that axis' domain).";

const SIZEMODE = (letter: 'x' | 'y') =>
  attr.enumerated({
    values: ['scaled', 'pixel'],
    dflt: 'scaled',
    description: `\`scaled\`: \`${letter}0\`/\`${letter}1\` (and path ${letter} values) are in \`${letter}ref\` units. \`pixel\`: they are px offsets from \`${letter}anchor\`${letter === 'y' ? ' (positive up)' : ''}, so the shape keeps its size when zooming.`,
  });

/** Label positions: box positions for rects, circles and paths, `start`/`middle`/`end` for lines. */
const LABEL_POSITIONS = [
  'top left',
  'top center',
  'top right',
  'middle left',
  'middle center',
  'middle right',
  'bottom left',
  'bottom center',
  'bottom right',
  'start',
  'middle',
  'end',
] as const;

/** One shape. */
export const shapeItemAttributes = {
  visible: attr.enumerated({
    values: [true, false, 'legendonly'],
    dflt: true,
    description: 'Draw this shape (`legendonly` hides it until legend entries for shapes land).',
  }),
  type: attr.enumerated({
    values: ['circle', 'rect', 'path', 'line'],
    description:
      '`line` from (`x0`,`y0`) to (`x1`,`y1`); `rect` and `circle` (an ellipse) inside that box; `path` draws `path`. Default: `path` when `path` is set, else `rect`.',
  }),
  layer: attr.enumerated({
    values: ['below', 'above', 'between'],
    dflt: 'above',
    description:
      '`above` traces; `below` traces and grid lines; `between` grid lines and traces. Shapes with a `paper` reference draw under every subplot when not `above`.',
  }),
  xref: attr.string({ dflt: 'x', description: `Reference of the x coordinates: ${REF}` }),
  yref: attr.string({ dflt: 'y', description: `Reference of the y coordinates: ${REF}` }),
  xsizemode: SIZEMODE('x'),
  ysizemode: SIZEMODE('y'),
  xanchor: attr.any({ description: 'x anchor (in `xref` units) of a `pixel`-sized shape.' }),
  yanchor: attr.any({ description: 'y anchor (in `yref` units) of a `pixel`-sized shape.' }),
  x0: attr.any({ description: 'Start x. Default: 25% across the reference (px 0 when `pixel`).' }),
  x1: attr.any({ description: 'End x. Default: 75% across the reference (px 10 when `pixel`).' }),
  y0: attr.any({ description: 'Start y. Default: 25% up the reference (px 0 when `pixel`).' }),
  y1: attr.any({ description: 'End y. Default: 75% up the reference (px 10 when `pixel`).' }),
  path: attr.string({
    description:
      'SVG path (`type: path`) with coordinates in `xref`/`yref` units: M, L, H, V, C, S, Q, T, A, Z and their relative forms. Dates use `_` between date and time (`2024-01-05_12:00`); relative commands and arcs need numbers.',
  }),
  opacity: attr.number({ min: 0, max: 1, dflt: 1, description: 'Opacity of the shape.' }),
  line: attr.object(
    {
      color: attr.color({ dflt: '#444', description: 'Outline color.' }),
      width: attr.number({ min: 0, dflt: 2, description: 'Outline width, px (0: no outline).' }),
      dash: attr.string({
        dflt: 'solid',
        description:
          "Dash style: `solid`, `dot`, `dash`, `longdash`, `dashdot`, `longdashdot` or a px list (`'5px,10px'`).",
      }),
    },
    { description: 'Outline.' },
  ),
  fillcolor: attr.color({
    dflt: 'rgba(0,0,0,0)',
    description:
      'Fill of closed shapes (`rect`, `circle`, `path`; open paths are closed for filling).',
  }),
  fillrule: attr.enumerated({
    values: ['evenodd', 'nonzero'],
    dflt: 'evenodd',
    description: 'How overlapping subpaths of a `path` fill (SVG `fill-rule`).',
  }),
  editable: attr.boolean({
    dflt: false,
    description: 'Let users drag and resize this shape even when the chart is not editable.',
  }),
  showlegend: attr.boolean({
    dflt: false,
    description: 'Legend entry for this shape (declared; not drawn yet).',
  }),
  legendgroup: attr.string({ dflt: '', description: 'Legend group (declared; not used yet).' }),
  label: attr.object(
    {
      text: attr.string({ dflt: '', description: 'Label text (`<br>` breaks lines).' }),
      texttemplate: attr.string({
        dflt: '',
        description:
          'Label template overriding `text` (not for paths): `%{x0}`, `%{x1}`, `%{y0}`, `%{y1}`, `%{xcenter}`, `%{ycenter}`, `%{dx}`, `%{dy}`, `%{width}`, `%{height}`, and for lines `%{length}` and `%{slope}`, with d3 formats (`%{dx:.2f}`).',
      }),
      font: fontSchema('Label font. Defaults to `layout.font`.'),
      textposition: attr.enumerated({
        values: LABEL_POSITIONS,
        description:
          'Where the label sits: `start`/`middle`/`end` along lines (default `middle`), a box position for other shapes (default `middle center`).',
      }),
      textangle: attr.angle({
        dflt: 'auto',
        extras: ['auto'],
        description: 'Label angle, degrees clockwise. `auto`: along lines, else 0.',
      }),
      xanchor: attr.enumerated({
        values: ['auto', 'left', 'center', 'right'],
        dflt: 'auto',
        description: 'Which side of the label sits at its position. `auto` follows `textposition`.',
      }),
      yanchor: attr.enumerated({
        values: ['top', 'middle', 'bottom'],
        description:
          'Which side of the label sits at its position. Default: `bottom` for lines (text above the line), else the vertical part of `textposition`.',
      }),
      padding: attr.number({ min: 0, dflt: 3, description: 'Gap between label and shape, px.' }),
    },
    { description: 'Text label drawn with the shape.' },
  ),
} as const;

/** `layout.shapes`. */
export const shapesAttributes = attr.items(shapeItemAttributes, {
  itemName: 'shape',
  editType: SHAPE_EDIT,
  description: 'Lines, rectangles, ellipses and paths in data or paper coordinates (plan E5.5).',
});

/** Label placement values. */
export type ShapeLabelPosition = (typeof LABEL_POSITIONS)[number];

/** A defaulted shape. */
export interface FullShape {
  _index: number;
  visible: boolean | 'legendonly';
  type: 'circle' | 'rect' | 'path' | 'line';
  layer: 'below' | 'above' | 'between';
  xref: string;
  yref: string;
  xsizemode: 'scaled' | 'pixel';
  ysizemode: 'scaled' | 'pixel';
  xanchor?: unknown;
  yanchor?: unknown;
  x0?: unknown;
  x1?: unknown;
  y0?: unknown;
  y1?: unknown;
  path?: string;
  opacity: number;
  line: { color: string; width: number; dash: string };
  fillcolor: string;
  fillrule: 'evenodd' | 'nonzero';
  editable: boolean;
  showlegend: boolean;
  legendgroup: string;
  label: {
    text: string;
    texttemplate: string;
    font: FullFont;
    textposition: ShapeLabelPosition;
    textangle: number | 'auto';
    xanchor: 'auto' | 'left' | 'center' | 'right';
    yanchor: 'top' | 'middle' | 'bottom';
    padding: number;
  };
}

/**
 * Dependent shape defaults (Plotly's `shapes/defaults.js`): `type` follows `path`, pixel-sized
 * dimensions default to 0–10 px, label fonts inherit `layout.font`, and the label's `textposition`
 * and `yanchor` depend on the type. Positions of scaled dimensions stay unset here and resolve to
 * 25% / 75% of the reference when drawn (axis ranges are only known after autorange). Idempotent.
 */
export function supplyShapeDefaults(layoutOut: FullLayout): void {
  const list = layoutOut['shapes'];
  if (!Array.isArray(list)) return;
  const base = layoutOut.font as FullFont;
  for (const s of list as Partial<FullShape>[]) {
    if (!s.label) continue;
    s.type ??= typeof s.path === 'string' && s.path !== '' ? 'path' : 'rect';
    if (s.xsizemode === 'pixel') {
      s.x0 ??= 0;
      s.x1 ??= 10;
    }
    if (s.ysizemode === 'pixel') {
      s.y0 ??= 0;
      s.y1 ??= 10;
    }
    const line = s.type === 'line';
    const l = s.label;
    l.font = inheritFont(l.font, base);
    l.textposition ??= line ? 'middle' : 'middle center';
    l.yanchor ??= line
      ? 'bottom'
      : l.textposition.startsWith('top')
        ? 'top'
        : l.textposition.startsWith('bottom')
          ? 'bottom'
          : 'middle';
  }
}
