/**
 * `layout.annotations[]` attributes and defaults (plan E5.4), following Plotly's annotation model:
 * text anchored to data, domain or paper coordinates, with an optional arrow from the text to the
 * anchor point.
 */
import {
  attr,
  fontSchema,
  type FullLayout,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { inheritFont, rgba, type FullFont } from '../shared/text.ts';

/** Annotations only redraw (no margins, no trace work beyond a transform). */
const ANN_EDIT = ['plot'] as const;

const REF_DESCRIPTION =
  "`'paper'` (0–1 across the plot area), an axis id (`'x'`, `'x2'`: data units of that axis; log axes take exponents, as `range` does) or `'<axis> domain'` (0–1 across that axis' domain).";

/** One annotation. */
export const annotationItemAttributes = {
  visible: attr.boolean({ dflt: true, description: 'Draw this annotation.' }),
  text: attr.string({
    dflt: '',
    description:
      'Text. `<br>` breaks lines; `<b>`/`<i>` around the whole text, `<sup>`/`<sub>` digits and entities are rendered, other tags are dropped until rich text (E2.10).',
  }),
  textangle: attr.angle({ dflt: 0, description: 'Rotation of the text box, degrees clockwise.' }),
  font: fontSchema('Text font. Defaults to `layout.font`.'),
  width: attr.number({
    min: 1,
    description: 'Box width (text area), px. Default: the text width.',
  }),
  height: attr.number({
    min: 1,
    description: 'Box height (text area), px. Default: the text height.',
  }),
  opacity: attr.number({
    min: 0,
    max: 1,
    dflt: 1,
    description: 'Opacity of the whole annotation.',
  }),
  align: attr.enumerated({
    values: ['left', 'center', 'right'],
    dflt: 'center',
    description: 'Horizontal alignment of the lines inside the box.',
  }),
  valign: attr.enumerated({
    values: ['top', 'middle', 'bottom'],
    dflt: 'middle',
    description: 'Vertical alignment of the text inside the box (with `height`).',
  }),
  bgcolor: attr.color({ dflt: 'rgba(0,0,0,0)', description: 'Box background.' }),
  bordercolor: attr.color({ dflt: 'rgba(0,0,0,0)', description: 'Box border color.' }),
  borderpad: attr.number({ min: 0, dflt: 1, description: 'Padding between text and border, px.' }),
  borderwidth: attr.number({ min: 0, dflt: 1, description: 'Box border width, px.' }),
  showarrow: attr.boolean({
    dflt: true,
    description:
      'Draw an arrow from the text to `x`/`y`; the text then sits at the tail (`ax`/`ay`).',
  }),
  arrowcolor: attr.color({
    description: 'Arrow color. Defaults to `bordercolor` when visible, else `#444`.',
  }),
  arrowhead: attr.integer({
    min: 0,
    max: 8,
    dflt: 1,
    description:
      'End arrowhead: 0 none, 1 wide, 2 narrow, 3 barbed, 4–5 line-drawn, 6 circle, 7 square, 8 bar.',
  }),
  startarrowhead: attr.integer({ min: 0, max: 8, dflt: 1, description: 'Start arrowhead (0–8).' }),
  arrowside: attr.flaglist({
    flags: ['end', 'start'],
    extras: ['none'],
    dflt: 'end',
    description: 'Which ends get an arrowhead.',
  }),
  arrowsize: attr.number({
    min: 0.3,
    dflt: 1,
    description: 'End arrowhead size, relative to `arrowwidth`.',
  }),
  startarrowsize: attr.number({
    min: 0.3,
    dflt: 1,
    description: 'Start arrowhead size, relative to `arrowwidth`.',
  }),
  arrowwidth: attr.number({
    min: 0.1,
    description: 'Arrow line width, px. Defaults to 2 (twice a visible border width).',
  }),
  standoff: attr.number({
    min: 0,
    dflt: 0,
    description: 'Gap between the arrowhead tip and `x`/`y`, px.',
  }),
  startstandoff: attr.number({
    min: 0,
    dflt: 0,
    description: 'Gap between the text box and the start of the arrow, px.',
  }),
  ax: attr.any({
    description:
      'Arrow tail x: px from the head (`axref: pixel`, default −10) or a position in `axref` units.',
  }),
  ay: attr.any({
    description:
      'Arrow tail y: px from the head, positive down (`ayref: pixel`, default −30) or a position in `ayref` units.',
  }),
  axref: attr.string({ dflt: 'pixel', description: `\`'pixel'\`, or ${REF_DESCRIPTION}` }),
  ayref: attr.string({ dflt: 'pixel', description: `\`'pixel'\`, or ${REF_DESCRIPTION}` }),
  xref: attr.string({ dflt: 'x', description: `Reference of \`x\`: ${REF_DESCRIPTION}` }),
  yref: attr.string({ dflt: 'y', description: `Reference of \`y\`: ${REF_DESCRIPTION}` }),
  x: attr.any({
    description: 'Anchor x (the arrow head). Defaults to the middle of the reference.',
  }),
  y: attr.any({
    description: 'Anchor y (the arrow head). Defaults to the middle of the reference.',
  }),
  xanchor: attr.enumerated({
    values: ['auto', 'left', 'center', 'right'],
    dflt: 'auto',
    description:
      'Which side of the text box sits at the anchor (or tail). `auto`: `center` with an arrow or a data reference, else by thirds of `x`.',
  }),
  yanchor: attr.enumerated({
    values: ['auto', 'top', 'middle', 'bottom'],
    dflt: 'auto',
    description: 'Which side of the text box sits at the anchor (or tail); `auto` as `xanchor`.',
  }),
  xshift: attr.number({ dflt: 0, description: 'Shift the whole annotation right, px.' }),
  yshift: attr.number({ dflt: 0, description: 'Shift the whole annotation up, px.' }),
  clicktoshow: attr.enumerated({
    values: [false, 'onoff', 'onout'],
    dflt: false,
    description:
      'Toggle `visible` when a data point at `xclick`/`yclick` (default `x`/`y`) is clicked; `onout` also hides it on clicks on other points.',
  }),
  xclick: attr.any({ description: 'x of the point that toggles this annotation.' }),
  yclick: attr.any({ description: 'y of the point that toggles this annotation.' }),
  hovertext: attr.string({
    description: 'Hover text (declared; hover labels for annotations are not drawn yet).',
  }),
  hoverlabel: attr.object(
    {
      bgcolor: attr.color({ description: 'Hover label background.' }),
      bordercolor: attr.color({ description: 'Hover label border.' }),
      font: fontSchema('Hover label font.'),
    },
    { description: 'Hover label style (declared; not drawn yet).' },
  ),
  captureevents: attr.boolean({
    description:
      'Take pointer events over the text box and emit `clickannotation` on click. Defaults to true with `hovertext`.',
  }),
} as const;

/** `layout.annotations`. */
export const annotationsAttributes = attr.items(annotationItemAttributes, {
  itemName: 'annotation',
  editType: ANN_EDIT,
  description: 'Text annotations with optional arrows (plan E5.4).',
});

/** A defaulted annotation. */
export interface FullAnnotation {
  _index: number;
  visible: boolean;
  text: string;
  textangle: number;
  font: FullFont;
  width?: number;
  height?: number;
  opacity: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  bgcolor: string;
  bordercolor: string;
  borderpad: number;
  borderwidth: number;
  showarrow: boolean;
  arrowcolor: string;
  arrowhead: number;
  startarrowhead: number;
  arrowside: string;
  arrowsize: number;
  startarrowsize: number;
  arrowwidth: number;
  standoff: number;
  startstandoff: number;
  ax?: unknown;
  ay?: unknown;
  axref: string;
  ayref: string;
  xref: string;
  yref: string;
  x?: unknown;
  y?: unknown;
  xanchor: 'auto' | 'left' | 'center' | 'right';
  yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  xshift: number;
  yshift: number;
  clicktoshow: false | 'onoff' | 'onout';
  xclick?: unknown;
  yclick?: unknown;
  hovertext?: string;
  captureevents: boolean;
}

/**
 * Dependent annotation defaults (Plotly's `annotations/common_defaults.js`): fonts inherit
 * `layout.font`, the arrow takes the border color when the border is visible, the arrow width is
 * twice the visible border width (or 2), pixel tails default to (−10, −30) and `captureevents`
 * follows `hovertext`. Idempotent.
 */
export function supplyAnnotationDefaults(
  layoutOut: FullLayout,
  _ctx?: Pick<LayoutDefaultsContext, 'fullData'>,
): void {
  const list = layoutOut['annotations'];
  if (!Array.isArray(list)) return;
  const base = layoutOut.font as FullFont;
  for (const a of list as Partial<FullAnnotation>[]) {
    if (a.visible === false && a.text === undefined) continue;
    a.font = inheritFont(a.font, base);
    const borderVisible = rgba(a.bordercolor)[3] > 0;
    a.arrowcolor ??= borderVisible ? (a.bordercolor as string) : '#444';
    a.arrowwidth ??= ((borderVisible && a.borderwidth) || 1) * 2;
    if (a.axref === 'pixel') a.ax ??= -10;
    if (a.ayref === 'pixel') a.ay ??= -30;
    a.captureevents ??= typeof a.hovertext === 'string' && a.hovertext !== '';
  }
}
