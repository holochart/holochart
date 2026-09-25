/**
 * Geometry of the range selector (plan E5.9; Plotly `components/rangeselector/draw.js`
 * `reposition`): a row of buttons as tall as one text line (at least 16 px) plus 3 px, each at
 * least 30 px wide (text + 10 px), 5 px apart, anchored at (`x`, `y`) in paper fractions.
 *
 * Pure: text is measured through an injected {@link MeasureLine}; the view and `pushMargin` use
 * the shared font-metrics oracle.
 */
import { DEFAULT_FONT_FAMILY, type FullLayout } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { MarginPush } from '@mk7s/holochart-runtime';
import { anchoredMarginPush } from '../shared/placement.ts';
import {
  LINE_HEIGHT,
  plainText,
  textFont,
  type FullFont,
  type MeasureLine,
} from '../shared/text.ts';
import type { RangeselectorButton } from './step.ts';

/** Button text (Plotly): `label`, else `all`, else `count` + the step's initial (`6m`, `1y`). */
export function buttonLabel(button: Pick<RangeselectorButton, 'label' | 'step' | 'count'>): string {
  if (typeof button.label === 'string' && button.label !== '') return button.label;
  if (button.step === 'all') return 'all';
  return `${button.count}${button.step.charAt(0)}`;
}

/** A defaulted, visible `xaxis.rangeselector` (see core `defaults/rangeslider.ts`). */
export interface FullRangeselector {
  readonly visible: true;
  readonly buttons: readonly RangeselectorButton[];
  /** Paper fractions of the plot area (always numbers after defaults). */
  readonly x: number;
  readonly y: number;
  readonly xanchor: 'auto' | 'left' | 'center' | 'right';
  readonly yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  readonly font: FullFont;
  readonly bgcolor: string;
  readonly activecolor: string;
  readonly bordercolor: string;
  readonly borderwidth: number;
}

const str = (v: unknown, dflt: string): string => (typeof v === 'string' ? v : dflt);
const num = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

const STEPS: ReadonlySet<unknown> = new Set([
  'month',
  'year',
  'day',
  'hour',
  'minute',
  'second',
  'all',
]);

/**
 * The visible range selector of a defaulted axis (`axis.rangeselector`), or `undefined`.
 * Defensive: fields missing from a hand-built layout get the schema defaults.
 */
export function readRangeselector(axis: unknown): FullRangeselector | undefined {
  const sel = (axis as { rangeselector?: unknown } | null | undefined)?.rangeselector;
  if (typeof sel !== 'object' || sel === null) return undefined;
  const s = sel as Record<string, unknown>;
  if (s['visible'] !== true || !Array.isArray(s['buttons'])) return undefined;
  const buttons = (s['buttons'] as unknown[]).filter(
    (b): b is RangeselectorButton =>
      typeof b === 'object' && b !== null && STEPS.has((b as { step?: unknown }).step),
  );
  const f = (typeof s['font'] === 'object' && s['font'] !== null ? s['font'] : {}) as Record<
    string,
    unknown
  >;
  const font = {
    ...f,
    family: str(f['family'], DEFAULT_FONT_FAMILY),
    size: num(f['size'], 12),
    color: str(f['color'], '#444'),
  } as FullFont;
  const xanchor = s['xanchor'];
  const yanchor = s['yanchor'];
  const bgcolor = str(s['bgcolor'], '#eee');
  return {
    visible: true,
    buttons,
    x: num(s['x'], 0),
    y: num(s['y'], 1.02),
    xanchor: xanchor === 'auto' || xanchor === 'center' || xanchor === 'right' ? xanchor : 'left',
    yanchor: yanchor === 'auto' || yanchor === 'top' || yanchor === 'middle' ? yanchor : 'bottom',
    font,
    bgcolor,
    activecolor: str(s['activecolor'], bgcolor),
    bordercolor: str(s['bordercolor'], '#444'),
    borderwidth: Math.max(0, num(s['borderwidth'], 0)),
  };
}

/** A button's box relative to the selector's top-left corner, px. */
export interface RangeselectorButtonBox {
  readonly button: RangeselectorButton;
  /** Plain-text label (pseudo-HTML tags removed). */
  readonly label: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Button boxes and the unrounded size of the row. */
export interface RangeselectorSize {
  readonly buttons: readonly RangeselectorButtonBox[];
  readonly width: number;
  readonly height: number;
}

/** The anchors in use (Plotly's `isRightAnchor`, `isCenterAnchor`, …). */
export interface RangeselectorAnchors {
  readonly xanchor: 'left' | 'center' | 'right';
  readonly yanchor: 'top' | 'middle' | 'bottom';
}

/** The placed selector: boxes, rounded size and top-left corner in container px. */
export interface RangeselectorLayout extends RangeselectorAnchors {
  readonly buttons: readonly RangeselectorButtonBox[];
  /** `Math.ceil` of the row size. */
  readonly width: number;
  readonly height: number;
  /** Top-left corner in container px (rounded). */
  readonly left: number;
  readonly top: number;
}

/** Minimum button width, px (Plotly's `minButtonWidth`). */
export const RANGESELECTOR_MIN_BUTTON_WIDTH = 30;
/** Gap between buttons, px. */
export const RANGESELECTOR_GAP = 5;

/**
 * Size the visible buttons (Plotly's `reposition`): height `max(lines · size · 1.3, 16) + 3` (the
 * tallest label), widths `max(text + 10, 30)`; button `i` at `borderwidth + Σ(w + 5)`. The row is
 * `Σ(w + 5)` wide (Plotly counts the trailing gap too).
 */
export function measureRangeselector(
  selector: FullRangeselector,
  measure: MeasureLine,
): RangeselectorSize {
  const font = textFont(selector.font);
  const bw = selector.borderwidth;
  const labels = selector.buttons
    .filter((b) => b.visible !== false)
    .map((button) => ({ button, lines: plainText(buttonLabel(button)).split('\n') }));
  let height = 0;
  for (const { lines } of labels) {
    height = Math.max(height, Math.max(selector.font.size * LINE_HEIGHT * lines.length, 16) + 3);
  }
  let width = 0;
  const buttons = labels.map(({ button, lines }): RangeselectorButtonBox => {
    let text = 0;
    for (const line of lines) text = Math.max(text, measure(line, font));
    const w = Math.max(text + 10, RANGESELECTOR_MIN_BUTTON_WIDTH);
    const box = { button, label: lines.join('\n'), left: bw + width, top: bw, width: w, height };
    width += w + RANGESELECTOR_GAP;
    return box;
  });
  return { buttons, width, height };
}

/** Resolve `auto` anchors from the position (Plotly: thirds of the plot area). */
export function resolveRangeselectorAnchors(
  selector: Pick<FullRangeselector, 'x' | 'y' | 'xanchor' | 'yanchor'>,
): RangeselectorAnchors {
  const { x, y } = selector;
  const auto = (a: string): boolean => a === 'auto';
  const xanchor =
    selector.xanchor === 'right' || (auto(selector.xanchor) && x >= 2 / 3)
      ? 'right'
      : selector.xanchor === 'center' || (auto(selector.xanchor) && x > 1 / 3 && x < 2 / 3)
        ? 'center'
        : 'left';
  const yanchor =
    selector.yanchor === 'bottom' || (auto(selector.yanchor) && y <= 1 / 3)
      ? 'bottom'
      : selector.yanchor === 'middle' || (auto(selector.yanchor) && y > 1 / 3 && y < 2 / 3)
        ? 'middle'
        : 'top';
  return { xanchor, yanchor };
}

/**
 * Place the selector against `plotArea` (container px): the anchor point is `x`, `y` in paper
 * fractions, moved by the row size per anchor; then the size is ceiled and the corner rounded.
 */
export function layoutRangeselector(
  selector: FullRangeselector,
  plotArea: Readonly<ViewportRect>,
  measure: MeasureLine,
): RangeselectorLayout {
  const size = measureRangeselector(selector, measure);
  const anchors = resolveRangeselectorAnchors(selector);
  let left = plotArea.x + plotArea.width * selector.x;
  let top = plotArea.y + plotArea.height * (1 - selector.y);
  if (anchors.xanchor === 'right') left -= size.width;
  else if (anchors.xanchor === 'center') left -= size.width / 2;
  if (anchors.yanchor === 'bottom') top -= size.height;
  else if (anchors.yanchor === 'middle') top -= size.height / 2;
  return {
    ...anchors,
    buttons: size.buttons,
    width: Math.ceil(size.width),
    height: Math.ceil(size.height),
    left: Math.round(left),
    top: Math.round(top),
  };
}

/**
 * Margin the selector needs to stay inside the figure (Plotly's `autoMargin` of
 * `<axis>-range-selector`), for a figure of `size` with base margins `margin`.
 */
export function rangeselectorMarginPush(
  selector: FullRangeselector,
  size: { width: number; height: number },
  margin: Pick<FullLayout['margin'], 'l' | 'r' | 't' | 'b'>,
  measure: MeasureLine,
): MarginPush | undefined {
  const box = measureRangeselector(selector, measure);
  if (box.buttons.length === 0) return undefined;
  const anchors = resolveRangeselectorAnchors(selector);
  return anchoredMarginPush(
    { x: selector.x, y: selector.y, xref: 'paper', yref: 'paper', ...anchors },
    size,
    margin,
    { width: Math.ceil(box.width), height: Math.ceil(box.height) },
  );
}
