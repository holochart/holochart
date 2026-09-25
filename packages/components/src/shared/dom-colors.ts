/**
 * Colors of the DOM widgets (update menus, sliders) derived from the resolved layout, so they follow
 * the active template: Plotly's own widget colors on a light paper (`plotly-classic`, `plotly`,
 * `plotly_white`, …) and tints of the paper toward the text color on a dark one (the `holochart`
 * default look, ADR-021; `plotly_dark` sets its own through `updatemenudefaults` /
 * `sliderdefaults`). Values set by the figure or a template always win: these only fill gaps.
 */
import { isPlainObject, toRGBA, type FullLayout } from '@mk7s/holochart-core';

/** An sRGB 0–1 color with alpha. */
type Rgba = readonly [number, number, number, number];

const WHITE: Rgba = [1, 1, 1, 1];
const INK: Rgba = [0x44 / 255, 0x44 / 255, 0x44 / 255, 1];

function parse(css: unknown, fallback: Rgba): Rgba {
  if (typeof css !== 'string') return fallback;
  const c = toRGBA(css);
  return c ? [c[0], c[1], c[2], c[3]] : fallback;
}

/** Relative luminance (WCAG) of an sRGB color. */
function luminance([r, g, b]: Rgba): number {
  const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** `a` → `b` by `t` (0–1), as an opaque `rgb()` CSS color (alpha of `a` is ignored). */
function mix(a: Rgba, b: Rgba, t: number): string {
  const ch = (x: number, y: number): number => Math.round((x + (y - x) * t) * 255);
  return `rgb(${ch(a[0], b[0])}, ${ch(a[1], b[1])}, ${ch(a[2], b[2])})`;
}

/** The paper and text colors of a layout and whether the paper is dark. */
export interface WidgetInk {
  readonly paper: Rgba;
  readonly ink: Rgba;
  /** The paper is dark (luminance < 0.2), e.g. the `holochart` default look. */
  readonly dark: boolean;
  /** `paper → ink` by `t`, as a CSS color. */
  tint(t: number): string;
}

/**
 * Paper and text colors of `layout`. A transparent paper counts as white (a page behind a
 * transparent chart is usually light), the text color defaults to Plotly's `#444`.
 */
export function widgetInk(layout: FullLayout): WidgetInk {
  const paperRaw = parse(layout.paper_bgcolor, WHITE);
  const paper: Rgba = paperRaw[3] === 0 ? WHITE : paperRaw;
  const font = isPlainObject(layout.font) ? layout.font['color'] : undefined;
  const ink = parse(font, INK);
  return { paper, ink, dark: luminance(paper) < 0.2, tint: (t) => mix(paper, ink, t) };
}
