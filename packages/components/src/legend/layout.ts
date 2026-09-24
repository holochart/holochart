/**
 * Legend content and layout (plan E5.2), pure given a text measure: which traces get an entry and
 * in what order (`traceorder`, `legendrank`, `legendgroup`), item and title boxes for vertical and
 * horizontal legends, the legend's position (`x`/`y`, anchors, refs) and the margin it pushes.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { TextFont, ViewportRect } from '@mk7s/holochart-render';
import type { LegendGlyph, LegendItem, MarginPush } from '@mk7s/holochart-runtime';
import {
  LINE_HEIGHT,
  measureBlock,
  plainText,
  styledText,
  textFont,
  type MeasureLine,
  type TextBox,
} from '../shared/text.ts';
import { anchorFraction, anchoredMarginPush, type AnchoredBox } from '../shared/placement.ts';
import type { FullLegend } from './schema.ts';

/** Padding inside the legend box and between glyph and text, px (Plotly `itemGap`). */
export const ITEM_GAP = 5;
/** Minimum item height before the 3 px row gap, px (Plotly). */
const MIN_ITEM_HEIGHT = 16;
/** Plotly's `legendrank` default. */
export const DEFAULT_RANK = 1000;

/** One legend item. */
export interface LegendEntry {
  /** Trace index in `data` (for per-point items: the first trace showing the item). */
  index: number;
  /**
   * Per-point items only (pie labels, `TraceModule.legendItems`): the item key toggled in
   * `layout.hiddenlabels`. `undefined` for one-item-per-trace entries.
   */
  key?: string;
  /** Item text (plain text, lines split on `\n`). */
  name: string;
  group: string;
  rank: number;
  visible: boolean | 'legendonly';
  glyph: LegendGlyph;
}

/** Does this trace get a legend item? */
export function hasLegendEntry(trace: FullTrace): boolean {
  if (trace.visible === false || trace['showlegend'] === false) return false;
  const module = trace._module as
    { categories?: readonly string[]; legendIcon?: unknown } | undefined;
  if (!module) return false;
  return (
    module.categories?.includes('showLegend') === true || typeof module.legendIcon === 'function'
  );
}

function rankOf(trace: FullTrace): number {
  const r = trace['legendrank'];
  return typeof r === 'number' && Number.isFinite(r) ? r : DEFAULT_RANK;
}

/**
 * Legend entries in display order. `traceorder` flags: `reversed` flips the order, `grouped`
 * gathers items by `legendgroup` (groups ordered by their best rank, then first appearance).
 * Within that, `legendrank` sorts (stable, so equal ranks keep trace order).
 *
 * Traces for which `itemsOf` returns items (pie: one per label) contribute one entry per item
 * instead; an item key shows once per `legendgroup` across traces (Plotly's pie-like legends).
 */
export function legendEntries(
  fullData: readonly FullTrace[],
  traceorder: string,
  glyphOf: (trace: FullTrace) => LegendGlyph,
  itemsOf?: (trace: FullTrace) => readonly LegendItem[] | undefined,
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  const shown = new Set<string>();
  for (const trace of fullData) {
    if (!hasLegendEntry(trace)) continue;
    const items = itemsOf?.(trace);
    if (items) {
      const group = typeof trace['legendgroup'] === 'string' ? trace['legendgroup'] : '';
      for (const item of items) {
        const id = `${group}\u0000${item.key}`;
        if (shown.has(id)) continue;
        shown.add(id);
        entries.push({
          index: trace._index,
          key: item.key,
          name: plainText(item.name),
          group,
          rank: rankOf(trace),
          visible: item.hidden ? 'legendonly' : true,
          glyph: item.glyph,
        });
      }
      continue;
    }
    entries.push({
      index: trace._index,
      name: plainText(String(trace.name ?? '')),
      group: typeof trace['legendgroup'] === 'string' ? trace['legendgroup'] : '',
      rank: rankOf(trace),
      visible: trace.visible,
      glyph: glyphOf(trace),
    });
  }
  const flags = traceorder.split('+');
  let ordered = [...entries].sort((a, b) => a.rank - b.rank);
  if (flags.includes('grouped')) {
    const groups = new Map<string, LegendEntry[]>();
    for (const e of ordered) {
      // Ungrouped traces (and per-point items) each form their own group.
      const key = e.group === '' ? `\u0000${e.index}\u0000${e.key ?? ''}` : e.group;
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }
    ordered = [...groups.values()].flat();
  }
  if (flags.includes('reversed')) ordered.reverse();
  return ordered;
}

/** A laid-out item, relative to the legend's top-left corner. */
export interface LegendItemBox {
  entry: LegendEntry;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Glyph center. */
  glyphX: number;
  glyphY: number;
  /** Text anchor (left, middle). */
  textX: number;
  textY: number;
}

/** The legend's size and content boxes, relative to its top-left corner. */
export interface LegendBoxes {
  width: number;
  height: number;
  items: LegendItemBox[];
  title: { text: string; font: TextFont; x: number; y: number } | undefined;
}

/** Options for {@link layoutLegend}. */
export interface LegendLayoutOptions {
  measure: MeasureLine;
  /** Width available for a row of a horizontal legend, px. */
  maxWidth: number;
  /** Width of the plot area (for `entrywidthmode: 'fraction'`), px. */
  plotWidth: number;
  /** Figure height (for a fractional `maxheight`), px. */
  figureHeight: number;
}

/** In grouped order, does `e` start a new group after `prev`? (Ungrouped items stand alone.) */
function newGroup(prev: LegendEntry, e: LegendEntry): boolean {
  return prev.group !== e.group || e.group === '';
}

function itemHeight(box: TextBox, fontSize: number): number {
  return Math.max(box.lines * fontSize * LINE_HEIGHT, MIN_ITEM_HEIGHT) + 3;
}

/**
 * Item and title boxes (Plotly's legend metrics: 30 px glyph area, text 40 px from the item's
 * left, `max(text height, 16) + 3` px rows, 5 px padding). Vertical legends stack items (with
 * `tracegroupgap` between groups when grouped); horizontal ones fill rows up to `maxWidth`.
 */
export function layoutLegend(
  legend: FullLegend,
  entries: readonly LegendEntry[],
  options: LegendLayoutOptions,
): LegendBoxes {
  const bw = legend.borderwidth;
  const font = textFont(legend.font);
  const grouped = legend.traceorder.includes('grouped');
  const glyphW = legend.itemwidth;
  const textOffset = legend.indentation + ITEM_GAP + glyphW + ITEM_GAP;
  const measured = entries.map((e) => measureBlock(e.name, font, options.measure));

  const { text: titleText, font: titleFont } = styledText(
    legend.title.text,
    textFont(legend.title.font),
  );
  const titleBox = measureBlock(titleText, titleFont, options.measure);
  const hasTitle = titleText !== '';
  const titleSide = legend.title.side;
  const titleOnTop = hasTitle && titleSide.startsWith('top');
  const titleLeft = hasTitle && titleSide === 'left';

  const items: LegendItemBox[] = [];
  const x0 = bw + (titleLeft ? ITEM_GAP + titleBox.width + ITEM_GAP : 0);
  let y = bw + ITEM_GAP + (titleOnTop ? titleBox.height + ITEM_GAP : 0);
  let width = 0;

  const place = (e: LegendEntry, box: TextBox, x: number, yTop: number, w: number, h: number) => {
    const item: LegendItemBox = {
      entry: e,
      x,
      y: yTop,
      width: w,
      height: h,
      glyphX: x + legend.indentation + ITEM_GAP + glyphW / 2,
      glyphY: yTop + h / 2,
      textX: x + textOffset,
      textY: yTop + h / 2,
    };
    // `valign` aligns the glyph with the first or last line of multi-line text.
    if (box.lines > 1 && legend.valign !== 'middle') {
      const line = legend.font.size * LINE_HEIGHT;
      item.glyphY = legend.valign === 'top' ? yTop + 1.5 + line / 2 : yTop + h - 1.5 - line / 2;
    }
    items.push(item);
    return item;
  };

  if (legend.orientation === 'v') {
    entries.forEach((e, i) => {
      const box = measured[i] as TextBox;
      const prev = entries[i - 1];
      if (grouped && prev && newGroup(prev, e)) y += legend.tracegroupgap;
      const h = itemHeight(box, legend.font.size);
      const w = textOffset + box.width + ITEM_GAP;
      place(e, box, x0, y, w, h);
      width = Math.max(width, x0 + w);
      y += h;
    });
    y += ITEM_GAP;
  } else {
    const fixed =
      legend.entrywidth !== undefined && legend.entrywidth > 0
        ? legend.entrywidthmode === 'fraction'
          ? legend.entrywidth * options.plotWidth
          : legend.entrywidth
        : undefined;
    let x = x0;
    let rowH = 0;
    const rowLimit = Math.max(options.maxWidth - bw, x0 + 1);
    entries.forEach((e, i) => {
      const box = measured[i] as TextBox;
      const h = itemHeight(box, legend.font.size);
      const w = fixed ?? textOffset + box.width + 2 * ITEM_GAP;
      const prev = entries[i - 1];
      const gap = grouped && prev && newGroup(prev, e) ? legend.tracegroupgap : 0;
      if (x > x0 && x + gap + w > rowLimit) {
        x = x0;
        y += rowH;
        rowH = 0;
      } else {
        x += gap;
      }
      place(e, box, x, y, w, h);
      x += w;
      width = Math.max(width, x);
      rowH = Math.max(rowH, h);
    });
    y += rowH + ITEM_GAP;
  }

  let title: LegendBoxes['title'];
  if (hasTitle) {
    title = { text: titleText, font: titleFont, x: bw + ITEM_GAP, y: bw + ITEM_GAP };
    width = Math.max(width, bw + ITEM_GAP + titleBox.width + ITEM_GAP);
    if (titleLeft) y = Math.max(y, bw + ITEM_GAP + titleBox.height + ITEM_GAP);
  }
  if (entries.length === 0 && !hasTitle) return { width: 0, height: 0, items, title };
  const height = y + bw;
  width += bw;

  // Centered / right-aligned top titles move once the width is known.
  if (title && titleOnTop && titleSide !== 'top' && titleSide !== 'top left') {
    const free = width - 2 * (bw + ITEM_GAP) - titleBox.width;
    title.x += titleSide === 'top center' ? free / 2 : free;
  }

  // `maxheight`: scrolling is not implemented yet, so items past the limit are dropped.
  const maxH = legend.maxheight;
  if (maxH !== undefined && maxH > 0) {
    const limit = maxH <= 1 ? maxH * options.figureHeight : maxH;
    if (height > limit) {
      const kept = items.filter((it) => it.y + it.height <= limit - bw - ITEM_GAP);
      return { width, height: limit, items: kept, title };
    }
  }
  return { width, height, items, title };
}

/** Resolve `auto` anchors (Plotly: by thirds of the reference). */
export function legendAnchors(legend: FullLegend): { x: string; y: string } {
  const x =
    legend.xanchor !== 'auto'
      ? legend.xanchor
      : legend.x >= 2 / 3
        ? 'right'
        : legend.x > 1 / 3
          ? 'center'
          : 'left';
  const y =
    legend.yanchor !== 'auto'
      ? legend.yanchor
      : legend.y >= 2 / 3
        ? 'top'
        : legend.y > 1 / 3
          ? 'middle'
          : 'bottom';
  return { x, y };
}

/** Top-left corner of the legend box, container px. */
export function legendOrigin(
  legend: FullLegend,
  size: { width: number; height: number },
  plotArea: Readonly<ViewportRect>,
  box: { width: number; height: number },
): { left: number; top: number } {
  const a = legendAnchors(legend);
  const ax =
    legend.xref === 'paper' ? plotArea.x + legend.x * plotArea.width : legend.x * size.width;
  const ay =
    legend.yref === 'paper'
      ? plotArea.y + (1 - legend.y) * plotArea.height
      : (1 - legend.y) * size.height;
  return {
    left: ax - anchorFraction(a.x) * box.width,
    top: ay - anchorFraction(a.y) * box.height,
  };
}

/**
 * Margin the legend needs to stay inside the figure (paper-referenced legends only), solving
 * Plotly-style for the plot size the pushed margin leaves: e.g. a legend at `x = 1.02` anchored
 * left needs `r = (0.02·(W − l) + w) / 1.02`. `margin` holds the figure's base margins.
 */
export function legendMarginPush(
  legend: FullLegend,
  size: { width: number; height: number },
  margin: { l: number; r: number; t: number; b: number },
  box: { width: number; height: number },
): MarginPush | undefined {
  const a = legendAnchors(legend);
  return anchoredMarginPush(
    {
      x: legend.x,
      y: legend.y,
      xref: legend.xref,
      yref: legend.yref,
      xanchor: a.x as AnchoredBox['xanchor'],
      yanchor: a.y as AnchoredBox['yanchor'],
    },
    size,
    margin,
    box,
  );
}

/** Whether the legend is drawn at all. */
export function legendShown(fullLayout: FullLayout): boolean {
  const legend = fullLayout['legend'] as FullLegend | undefined;
  return fullLayout.showlegend === true && legend !== undefined && legend.visible !== false;
}
