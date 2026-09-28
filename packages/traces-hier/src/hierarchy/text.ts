/**
 * Label fonts of the hierarchy traces (plan E13.1), ported from plotly.js' sunburst `helpers.js`
 * (`determineTextFont`): the transparent root's label sits on the background and uses
 * `outsidetextfont`; the others use `insidetextfont` (treemap and icicle path bars
 * `pathbar.textfont`) with a color contrasting their node unless one is set. Each font field falls
 * back to `textfont`, then `layout.font`, per node.
 */
import { toRGBA, type FullLayout, type FullTrace, type RGBA } from '@mk7s/holochart-core';
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

const WHITE: RGBA = [1, 1, 1, 1];
const DARK: RGBA = toRGBA(DEFAULT_LINE)!;

/**
 * Plotly's `Color.contrast` without amounts: white on dark colors, `#444` on light ones
 * (tinycolor's `isDark`: perceived brightness below 128), translucent colors over white first.
 */
export function contrastColor(color: string): RGBA {
  const c = toRGBA(color) ?? DARK;
  const a = c[3];
  const mix = (v: number): number => v * a + (1 - a);
  const brightness = (mix(c[0]) * 299 + mix(c[1]) * 587 + mix(c[2]) * 114) / 1000;
  return brightness * 255 < 128 ? WHITE : DARK;
}

/** A resolved label font and color. */
export interface LabelFont {
  readonly font: TextFont;
  readonly color: RGBA;
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
