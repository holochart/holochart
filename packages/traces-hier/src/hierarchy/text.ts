/**
 * Label fonts of the hierarchy traces (plan E13.1), ported from plotly.js' sunburst `helpers.js`
 * (`determineTextFont`): the transparent root's label sits on the background and uses
 * `outsidetextfont`; the others use `insidetextfont` (treemap and icicle path bars
 * `pathbar.textfont`) with a color contrasting their node unless one is set. Each font field falls
 * back to `textfont`, then `layout.font`, per node.
 *
 * With `layout.uniformtext` (E4.6), label fonts are raised to `minsize` and every label's fit is
 * recorded, then resized to the size negotiated across the traces of the type ({@link
 * UniformTextPass}; Plotly's `ensureUniformFontSize`, `recordMinTextSize` and `resizeText`).
 */
import {
  toRGBA,
  uniformFontSize,
  uniformTextOf,
  uniformTextScale,
  uniformTextSize,
  type FullLayout,
  type FullTrace,
  type RGBAColor,
  type UniformText,
  type UniformTextItem,
} from '@mk7s/holochart-core';
import type { TextFont, TextFontWeight } from '@mk7s/holochart-render';
import type { HierNode } from './build.ts';
import { DEFAULT_LINE } from './colors.ts';
import { nodeAttr } from './format.ts';
import { isHierarchyRoot } from './levels.ts';

/** Line height of labels as a multiple of the font size (as pie's). */
export const LINE_HEIGHT = 1.2;

/** Labels whose fitted font is smaller than this many px are not drawn (they would be specks). */
export const MIN_FONT_SIZE = 1;

type FontContainer = Readonly<Record<string, unknown>> | undefined;

function container(trace: FullTrace, path: string): FontContainer {
  let c: unknown = trace;
  for (const key of path.split('.')) c = (c as Record<string, unknown> | undefined)?.[key];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

/** The first truthy value of `key` along a font chain (Plotly's `castOption(a) || …`). */
function chain(fonts: readonly FontContainer[], key: string, i: number): unknown {
  for (const f of fonts) {
    const v = nodeAttr(f?.[key], i);
    if (v) return v;
  }
  return undefined;
}

function toFont(fonts: readonly FontContainer[], i: number): TextFont {
  const family = chain(fonts, 'family', i);
  const size = Number(chain(fonts, 'size', i));
  const weight = chain(fonts, 'weight', i);
  const style = chain(fonts, 'style', i);
  return {
    family: typeof family === 'string' ? family : 'sans-serif',
    size: Number.isFinite(size) && size > 0 ? size : 12,
    ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
      ? { weight: weight as TextFontWeight }
      : {}),
    ...(style === 'italic' ? { style: 'italic' as const } : {}),
  };
}

const WHITE: RGBAColor = [1, 1, 1, 1];
const DARK: RGBAColor = toRGBA(DEFAULT_LINE)!;

/**
 * Plotly's `Color.contrast` without amounts: white on dark colors, `#444` on light ones
 * (tinycolor's `isDark`: perceived brightness below 128), translucent colors over white first.
 */
export function contrastColor(color: string): RGBAColor {
  const c = toRGBA(color) ?? DARK;
  const a = c[3];
  const mix = (v: number): number => v * a + (1 - a);
  const brightness = (mix(c[0]) * 299 + mix(c[1]) * 587 + mix(c[2]) * 114) / 1000;
  return brightness * 255 < 128 ? WHITE : DARK;
}

/** A resolved label font and color. */
export interface LabelFont {
  readonly font: TextFont;
  readonly color: RGBAColor;
}

/**
 * Plotly's `isOutsideText`: the hierarchy root's label, when nodes are not colorscaled (the root is
 * transparent by default, so its label sits on the background).
 */
export function isOutsideNode(colorscale: boolean, node: HierNode): boolean {
  return !colorscale && isHierarchyRoot(node);
}

/**
 * The font of a node's label (Plotly's `determineTextFont`); `onPathbar` for treemap and icicle
 * path bar segments (the root's is outside text there too).
 */
export function nodeFont(
  trace: FullTrace,
  colorscale: boolean,
  node: HierNode,
  fullLayout: FullLayout,
  onPathbar = false,
): LabelFont {
  const i = node.i;
  const layoutFont = fullLayout.font as unknown as FontContainer;
  const textfont = container(trace, 'textfont');
  if (isOutsideNode(colorscale, node)) {
    const fonts = [container(trace, 'outsidetextfont'), textfont, layoutFont];
    const color = chain(fonts, 'color', i);
    return {
      font: toFont(fonts, i),
      color: (typeof color === 'string' ? toRGBA(color) : null) ?? DARK,
    };
  }
  const own = container(trace, onPathbar ? 'pathbar.textfont' : 'insidetextfont');
  const custom = nodeAttr(own?.['color'], i);
  return {
    font: toFont([own, textfont, layoutFont], i),
    color: (typeof custom === 'string' ? toRGBA(custom) : null) ?? contrastColor(node.color),
  };
}

/**
 * `layout.uniformtext` in one label layout (E4.6): the layout raises fonts to `minsize` and records
 * every label's `{ fontSize, scale }` into `items` (hidden candidates included), for the size
 * negotiated across the traces of the type; labels are drawn at `size`, that negotiated size
 * (default: this trace's own).
 */
export interface UniformTextPass {
  readonly uniform: UniformText;
  readonly size?: number | undefined;
  readonly items: UniformTextItem[];
}

/** A {@link UniformTextPass} with the layout's `uniformtext` and no negotiated size. */
export function uniformTextPass(fullLayout: FullLayout): UniformTextPass {
  return { uniform: uniformTextOf(fullLayout), items: [] };
}

/** `font` raised to `minsize` (Plotly's `ensureUniformFontSize`; unchanged when off). */
export function uniformFont(font: TextFont, pass: UniformTextPass): TextFont {
  return pass.uniform.mode ? { ...font, size: uniformFontSize(font.size, pass.uniform) } : font;
}

/**
 * The scale each label is drawn at (Plotly's `resizeText`): the fit scales of `fits` when
 * `uniformtext` is off; else the uniform size over the font size (never above 1), 0 for hidden
 * candidates in `hide` mode. Records `fits` into `pass.items`.
 */
export function uniformScales(fits: readonly UniformTextItem[], pass: UniformTextPass): number[] {
  const u = pass.uniform;
  if (!u.mode) return fits.map((f) => f.scale);
  pass.items.push(...fits);
  const size = pass.size ?? uniformTextSize(fits, u);
  return fits.map((f) => Math.min(1, uniformTextScale(f, size, u)));
}
