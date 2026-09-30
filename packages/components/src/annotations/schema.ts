/**
 * `layout.annotations[]` attributes and defaults (plan E5.4), following Plotly's annotation model:
 * text anchored to data, domain or paper coordinates, with an optional arrow from the text to the
 * anchor point.
 */
import {
  annotationItemAttributes,
  attr,
  SUBPLOT_TITLE_FONT_SCALE,
  SUBPLOT_TITLE_NAME,
  type FullLayout,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { inheritFont, rgba, type FullFont } from '../shared/text.ts';

/** Annotations only redraw (no margins, no trace work beyond a transform). */
const ANN_EDIT = ['plot'] as const;

/** One annotation (declared in core, where the 3D add-on can reuse it). */
export { annotationItemAttributes };

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
 * follows `hovertext`. Subplot titles from `makeSubplots` (named `SUBPLOT_TITLE_NAME`) without a
 * font size get 4/3 of the layout font size (plotly.py's 16 px over 12 px). Idempotent.
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
    if (
      (a as { name?: unknown }).name === SUBPLOT_TITLE_NAME &&
      typeof a.font?.size !== 'number' &&
      typeof base?.size === 'number'
    ) {
      a.font = { ...a.font, size: Math.round(base.size * SUBPLOT_TITLE_FONT_SCALE) } as FullFont;
    }
    a.font = inheritFont(a.font, base);
    const borderVisible = rgba(a.bordercolor)[3] > 0;
    a.arrowcolor ??= borderVisible ? (a.bordercolor as string) : '#444';
    a.arrowwidth ??= ((borderVisible && a.borderwidth) || 1) * 2;
    if (a.axref === 'pixel') a.ax ??= -10;
    if (a.ayref === 'pixel') a.ay ??= -30;
    a.captureevents ??= typeof a.hovertext === 'string' && a.hovertext !== '';
  }
}
