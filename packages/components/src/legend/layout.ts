/**
 * Legend content and layout (plan E5.2), pure given a text measure: which traces get an entry and
 * in what order (`traceorder`, `legendrank`, `legendgroup`, group titles), item and title boxes
 * for vertical and horizontal legends, the legend's position (`x`/`y`, anchors, refs) and the
 * margin it pushes.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { TextFont, TextRunLines, ViewportRect } from '@mk7s/holochart-render';
import type { LegendGlyph, LegendItem, MarginPush } from '@mk7s/holochart-runtime';
import {
  inheritFont,
  LINE_HEIGHT,
  measureStyled,
  plainText,
  styledText,
  textFont,
  type MeasureLine,
  type StyledText,
  type FullFont,
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
/** Room a scrolling legend adds on its right for the scrollbar (Plotly: 6 px bar, 4 px margin). */
export const SCROLLBAR_ROOM = 10;

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
  /** The name as given, when it has rich-text markup (E2.10): drawn with its styles. */
  markup?: string;
  group: string;
  rank: number;
  visible: boolean | 'legendonly';
  glyph: LegendGlyph;
  /** The trace's `legendwidth` (horizontal legends), when set. */
  legendwidth?: number;
  /**
   * Set on a group title (Plotly's `legendgrouptitle` pseudo-item heading its group): its font,
   * and whether clicking it toggles the group (not for per-point items or ungrouped traces). The
   * title's `index`, `rank` and `glyph` (not drawn) are its group's first item's; `visible` is
   * `legendonly` when no trace of the group is shown.
   */
  groupTitle?: { font: FullFont; clickable: boolean };
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

/** A trace's `legendgrouptitle`, when it has a text. */
interface GroupTitleIn {
  text: string;
  font?: Partial<FullFont>;
}

function legendGroupOf(trace: FullTrace): string {
  return typeof trace['legendgroup'] === 'string' ? trace['legendgroup'] : '';
}

function legendWidthOf(trace: FullTrace): { legendwidth?: number } {
  const w = trace['legendwidth'];
  return typeof w === 'number' && w > 0 ? { legendwidth: w } : {};
}

/**
 * Legend entries in display order. `traceorder` flags: `reversed` flips the order, `grouped`
 * gathers items by `legendgroup` (groups ordered by their best rank, then first appearance).
 * Within that, `legendrank` sorts (stable, so equal ranks keep trace order).
 *
 * Traces for which `itemsOf` returns items (pie: one per label) contribute one entry per item
 * instead; an item key shows once per `legendgroup` across traces (Plotly's pie-like legends).
 *
 * With `groupTitleFont` (`legend.grouptitlefont`), each group whose items have a
 * `legendgrouptitle.text` starts with a title entry (the first titled item's, in rank order), as
 * plotly.js `get_legend_data` does. Without grouping (or when every `legendgroup` is blank) the
 * whole legend is one group, so a title heads it.
 */
export function legendEntries(
  fullData: readonly FullTrace[],
  traceorder: string,
  glyphOf: (trace: FullTrace) => LegendGlyph,
  itemsOf?: (trace: FullTrace) => readonly LegendItem[] | undefined,
  groupTitleFont?: FullFont,
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  const shown = new Set<string>();
  const titles = new Map<LegendEntry, GroupTitleIn>();
  for (const trace of fullData) {
    if (!hasLegendEntry(trace)) continue;
    const gt = trace['legendgrouptitle'] as Partial<GroupTitleIn> | undefined;
    const title = typeof gt?.text === 'string' && gt.text !== '' ? (gt as GroupTitleIn) : undefined;
    const items = itemsOf?.(trace);
    if (items) {
      const group = typeof trace['legendgroup'] === 'string' ? trace['legendgroup'] : '';
      for (const item of items) {
        const id = `${group}\u0000${item.key}`;
        if (shown.has(id)) continue;
        shown.add(id);
        const entry: LegendEntry = {
          index: trace._index,
          key: item.key,
          name: plainText(item.name),
          ...markupOf(item.name),
          group,
          rank: rankOf(trace),
          visible: item.hidden ? 'legendonly' : true,
          glyph: item.glyph,
          ...legendWidthOf(trace),
        };
        entries.push(entry);
        if (title) titles.set(entry, title);
      }
      continue;
    }
    const entry: LegendEntry = {
      index: trace._index,
      name: plainText(String(trace.name ?? '')),
      ...markupOf(String(trace.name ?? '')),
      group: legendGroupOf(trace),
      rank: rankOf(trace),
      visible: trace.visible,
      glyph: glyphOf(trace),
      ...legendWidthOf(trace),
    };
    entries.push(entry);
    if (title) titles.set(entry, title);
  }
  const flags = traceorder.split('+');
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  let groups: LegendEntry[][] = [sorted];
  if (flags.includes('grouped') && sorted.some((e) => e.group !== '')) {
    const byKey = new Map<string, LegendEntry[]>();
    for (const e of sorted) {
      // Ungrouped traces (and per-point items) each form their own group.
      const key = e.group === '' ? `\u0000${e.index}\u0000${e.key ?? ''}` : e.group;
      const list = byKey.get(key);
      if (list) list.push(e);
      else byKey.set(key, [e]);
    }
    groups = [...byKey.values()];
  }
  const reversed = flags.includes('reversed');
  if (reversed) groups.reverse();
  return groups.flatMap((group) => {
    const first = group[0] as LegendEntry;
    const titled = groupTitleFont ? group.find((e) => titles.has(e)) : undefined;
    if (reversed) group.reverse();
    if (!titled || !groupTitleFont) return group;
    const t = titles.get(titled) as GroupTitleIn;
    const g = first.group;
    const anyShown = fullData.some((tr) => legendGroupOf(tr) === g && tr.visible === true);
    const title: LegendEntry = {
      index: first.index,
      name: plainText(t.text),
      ...markupOf(t.text),
      group: g,
      rank: first.rank,
      visible: anyShown ? true : 'legendonly',
      glyph: first.glyph,
      groupTitle: {
        font: inheritFont(t.font, groupTitleFont),
        clickable: g !== '' && group.every((e) => e.key === undefined),
      },
    };
    return [title, ...group];
  });
}

/** `{ markup }` for a name with tags or entities, else nothing (plain names stay plain). */
function markupOf(name: string): { markup?: string } {
  return /[<&]/.test(name) ? { markup: name } : {};
}

/** A laid-out item, relative to the legend's top-left corner. */
export interface LegendItemBox {
  entry: LegendEntry;
  /** The item's text as drawn (plain, or rich runs). */
  text: StyledText;
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
  /** Height of the box: of the content, or `maxheight` when that is less (the content scrolls). */
  height: number;
  /** Height of the whole content when it is taller than the box (scrolling), else `undefined`. */
  contentHeight?: number;
  items: LegendItemBox[];
  title: { text: string; font: TextFont; runs?: TextRunLines; x: number; y: number } | undefined;
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
  /** Plot area height (for a fractional `maxheight` of a vertical legend beside the plot), px. */
  plotHeight?: number;
}

/**
 * The most a legend's box may take vertically, px (plotly.js `_maxHeight`): `maxheight` px, or a
 * fraction of a reference height — the plot height for a vertical, paper-referenced legend beside
 * the plot, else the figure height — defaulting to 1 and 0.5 of those; never less than 30 px.
 */
export function legendMaxHeight(
  legend: FullLegend,
  plotHeight: number,
  figureHeight: number,
): number {
  const anchor = legendAnchors(legend).y;
  const below = legend.y < 0 || (legend.y === 0 && anchor === 'top');
  const above = legend.y > 1 || (legend.y === 1 && anchor === 'bottom');
  const figure = below || above || legend.orientation !== 'v' || legend.yref !== 'paper';
  const m = legend.maxheight || (figure ? 0.5 : 1);
  return Math.max(m > 1 ? m : m * (figure ? figureHeight : plotHeight), 30);
}

/**
 * In grouped order, does `e` start a new group after `prev`? (Ungrouped items stand alone; a group
 * title starts its group, and the item after it belongs to it.)
 */
function newGroup(prev: LegendEntry, e: LegendEntry): boolean {
  if (e.groupTitle) return true;
  if (prev.groupTitle) return false;
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
  // Plotly groups only when some `legendgroup` is set (else the legend is one group).
  const grouped = legend.traceorder.includes('grouped') && entries.some((e) => e.group !== '');
  const glyphW = legend.itemwidth;
  const textOffset = legend.indentation + ITEM_GAP + glyphW + ITEM_GAP;
  const fontOf = (e: LegendEntry): TextFont => (e.groupTitle ? textFont(e.groupTitle.font) : font);
  const texts = entries.map((e) =>
    e.markup !== undefined ? styledText(e.markup, fontOf(e)) : { text: e.name, font: fontOf(e) },
  );
  const measured = texts.map((t) => measureStyled(t, options.measure));
  const heightOf = (i: number): number =>
    itemHeight(measured[i] as TextBox, (texts[i] as StyledText).font.size);

  const titleStyled = styledText(legend.title.text, textFont(legend.title.font));
  const { text: titleText, font: titleFont } = titleStyled;
  const titleBox = measureStyled(titleStyled, options.measure);
  const hasTitle = titleText !== '';
  const titleSide = legend.title.side;
  const titleOnTop = hasTitle && titleSide.startsWith('top');
  const titleLeft = hasTitle && titleSide === 'left';

  const items: LegendItemBox[] = [];
  const x0 = bw + (titleLeft ? ITEM_GAP + titleBox.width + ITEM_GAP : 0);
  let y = bw + ITEM_GAP + (titleOnTop ? titleBox.height + ITEM_GAP : 0);
  let width = 0;

  const place = (i: number, x: number, yTop: number, w: number) => {
    const e = entries[i] as LegendEntry;
    const box = measured[i] as TextBox;
    const h = heightOf(i);
    const item: LegendItemBox = {
      entry: e,
      text: texts[i] as StyledText,
      x,
      y: yTop,
      width: w,
      height: h,
      glyphX: x + legend.indentation + ITEM_GAP + glyphW / 2,
      glyphY: yTop + h / 2,
      // Group titles have no glyph: their text starts at the item's padding (Plotly).
      textX: x + (e.groupTitle ? ITEM_GAP : textOffset),
      textY: yTop + h / 2,
    };
    // `valign` aligns the glyph with the first or last line of multi-line text.
    if (box.lines > 1 && legend.valign !== 'middle') {
      const line = legend.font.size * LINE_HEIGHT;
      item.glyphY = legend.valign === 'top' ? yTop + 1.5 + line / 2 : yTop + h - 1.5 - line / 2;
    }
    items.push(item);
  };

  if (legend.orientation === 'v') {
    entries.forEach((e, i) => {
      const box = measured[i] as TextBox;
      const prev = entries[i - 1];
      if (grouped && prev && newGroup(prev, e)) y += legend.tracegroupgap;
      const w = (e.groupTitle ? 2 * ITEM_GAP : textOffset) + box.width + ITEM_GAP;
      place(i, x0, y, w);
      width = Math.max(width, x0 + w);
      y += heightOf(i);
    });
    y += ITEM_GAP;
  } else {
    // Item width: `legendwidth` (per trace), else `entrywidth`, else the text's (Plotly's
    // `getTraceWidth`): a fraction of the plot width, or px of text after the glyph.
    const fraction = legend.entrywidthmode === 'fraction';
    const entryW = legend.entrywidth !== undefined && legend.entrywidth > 0 ? legend.entrywidth : 0;
    const widthOf = (i: number): number => {
      const e = entries[i] as LegendEntry;
      const set = e.legendwidth ?? entryW;
      if (set > 0 && fraction) return set * options.plotWidth;
      const start = e.groupTitle && !set ? 2 * ITEM_GAP : textOffset;
      return start + (set || (measured[i] as TextBox).width) + 2 * ITEM_GAP;
    };
    const rowLimit = Math.max(options.maxWidth - bw, x0 + 1);
    let x = x0;
    let rowH = 0;
    if (grouped) {
      // Plotly's grouped horizontal legend: each group is a column of items (its title on top),
      // columns fill rows, and `tracegroupgap` separates the rows.
      const columns: number[][] = [];
      entries.forEach((e, i) => {
        const prev = entries[i - 1];
        if (!prev || newGroup(prev, e)) columns.push([i]);
        else columns[columns.length - 1]?.push(i);
      });
      for (const column of columns) {
        const colW = Math.max(...column.map(widthOf));
        const colH = column.reduce((sum, i) => sum + heightOf(i), 0);
        if (x > x0 && x + colW > rowLimit) {
          x = x0;
          y += rowH + legend.tracegroupgap;
          rowH = 0;
        }
        let yItem = y;
        for (const i of column) {
          place(i, x, yItem, colW);
          yItem += heightOf(i);
        }
        x += colW;
        width = Math.max(width, x);
        rowH = Math.max(rowH, colH);
      }
    } else {
      entries.forEach((_, i) => {
        const w = widthOf(i);
        if (x > x0 && x + w > rowLimit) {
          x = x0;
          y += rowH;
          rowH = 0;
        }
        place(i, x, y, w);
        x += w;
        width = Math.max(width, x);
        rowH = Math.max(rowH, heightOf(i));
      });
    }
    y += rowH + ITEM_GAP;
  }

  let title: LegendBoxes['title'];
  if (hasTitle) {
    title = {
      text: titleText,
      font: titleFont,
      ...(titleStyled.runs ? { runs: titleStyled.runs } : {}),
      x: bw + ITEM_GAP,
      y: bw + ITEM_GAP,
    };
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

  // Taller than `maxheight`: the box keeps that height and the content scrolls in it.
  const limit = legendMaxHeight(
    legend,
    options.plotHeight ?? options.figureHeight,
    options.figureHeight,
  );
  if (height > limit) {
    return { width: width + SCROLLBAR_ROOM, height: limit, contentHeight: height, items, title };
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

/** Whether the legend `id` (`'legend'`, `'legend2'`, …) is drawn at all. */
export function legendShown(fullLayout: FullLayout, id = 'legend'): boolean {
  const legend = fullLayout[id] as FullLegend | undefined;
  return fullLayout.showlegend === true && legend !== undefined && legend.visible !== false;
}
