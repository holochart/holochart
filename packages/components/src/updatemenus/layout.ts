/**
 * Update-menu geometry (plotly.js `updatemenus/draw.js` `findDimensions`), pure: button and header
 * sizes from the measured labels, the menu's box and position, and its margin push. The DOM view
 * sizes its elements from this, so the margins reserved during layout and the drawn controls agree.
 *
 * Plotly's constants are for 12 px text; here they scale with the menu's font size, so the dense
 * default look (9 px) gets proportionally compact buttons and Plotly's look (12 px) Plotly's sizes.
 */
import type { ViewportRect } from '@mk7s/holochart-render';
import type { MarginPush } from '@mk7s/holochart-runtime';
import { anchoredMarginPush, anchoredOrigin, type AnchoredBox } from '../shared/placement.ts';
import {
  LINE_HEIGHT,
  measureBlock,
  plainText,
  textFont,
  type MeasureLine,
} from '../shared/text.ts';
import type { FullUpdatemenu } from './schema.ts';

/** Geometry constants at 12 px text (`updatemenus/constants.js`). */
export const UPDATEMENU_METRICS = {
  minWidth: 30,
  /** Horizontal text padding (both sides together). */
  textPadX: 24,
  /** Room for the dropdown arrow. */
  arrowPadX: 16,
  /** Vertical padding (each side). */
  textPadY: 4,
  gapButtonHeader: 5,
  gapButton: 2,
} as const;

/** Resolve `auto` anchors from the position (Plotly `Lib.isRightAnchor`, …). */
export function resolveXAnchor(xanchor: string, x: number): 'left' | 'center' | 'right' {
  if (xanchor === 'left' || xanchor === 'center' || xanchor === 'right') return xanchor;
  return x >= 2 / 3 ? 'right' : x > 1 / 3 ? 'center' : 'left';
}

export function resolveYAnchor(yanchor: string, y: number): 'top' | 'middle' | 'bottom' {
  if (yanchor === 'top' || yanchor === 'middle' || yanchor === 'bottom') return yanchor;
  return y >= 2 / 3 ? 'top' : y > 1 / 3 ? 'middle' : 'bottom';
}

/** One laid-out button: its index in `buttons` and its box relative to the item origin. */
export interface MenuItemBox {
  readonly index: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A laid-out menu (container px, top-left origin). */
export interface MenuLayout {
  readonly vertical: boolean;
  /** The padded box that pushes margins: every button, or the dropdown's header. */
  readonly width: number;
  readonly height: number;
  readonly xanchor: 'left' | 'center' | 'right';
  readonly yanchor: 'top' | 'middle' | 'bottom';
  /** Dropdown header (relative to the padded box). */
  readonly header?: { readonly x: number; readonly y: number; width: number; height: number };
  /**
   * Buttons, relative to the padded box: in place for `buttons` menus, the open list for dropdowns
   * (which may extend outside the box, on the `direction` side).
   */
  readonly items: readonly MenuItemBox[];
  /** Scale of the 12 px constants. */
  readonly scale: number;
}

/** Size one (visible) menu and lay out its buttons (see {@link placeUpdatemenu} for its position). */
export function layoutUpdatemenu(menu: FullUpdatemenu, measure: MeasureLine): MenuLayout {
  const s = menu.font.size / 12;
  const M = UPDATEMENU_METRICS;
  const vertical = menu.direction === 'up' || menu.direction === 'down';
  const font = textFont(menu.font);
  // Buttons are identified by their position in `buttons` (as `active` is), not `_index`: named
  // template buttons appended to the list all have `_index: -1`.
  const visible = menu.buttons.flatMap((b, index) => (b.visible ? [{ b, index }] : []));
  const widths: number[] = [];
  const heights: number[] = [];
  let width1 = 0;
  let height1 = 0;
  let total = 0;
  for (const { b } of visible) {
    const block = measureBlock(plainText(b.label), font, measure);
    const lines = Math.max(1, block.lines);
    const w = Math.ceil(Math.max(block.width + M.textPadX * s, M.minWidth * s));
    const h = Math.ceil(menu.font.size * LINE_HEIGHT * lines + 2 * M.textPadY * s);
    widths.push(w);
    heights.push(h);
    width1 = Math.max(width1, w);
    height1 = Math.max(height1, h);
    total += (vertical ? h : w) + M.gapButton;
  }
  if (visible.length > 0) total -= M.gapButton;
  const arrow = Math.ceil(M.arrowPadX * s);
  const gapHeader = Math.round(M.gapButtonHeader * s);
  const dropdown = menu.type === 'dropdown';

  let boxW: number;
  let boxH: number;
  let header: MenuLayout['header'];
  if (dropdown) {
    boxW = width1 + arrow;
    boxH = height1;
    header = { x: menu.pad.l, y: menu.pad.t, width: boxW, height: boxH };
  } else if (vertical) {
    boxW = width1;
    boxH = total;
  } else {
    boxW = total;
    boxH = height1;
  }

  // Items, relative to the padded box.
  const items: MenuItemBox[] = [];
  const openLength = total;
  let x = menu.pad.l;
  let y = menu.pad.t;
  if (dropdown) {
    if (menu.direction === 'down') y += height1 + gapHeader;
    else if (menu.direction === 'up') y -= gapHeader + openLength;
    else if (menu.direction === 'right') x += boxW + gapHeader;
    else x -= gapHeader + openLength;
  }
  visible.forEach(({ b, index }, k) => {
    const w = vertical ? (dropdown ? boxW : width1) : (widths[k] as number);
    const h = vertical ? (heights[k] as number) : height1;
    items.push({ index, label: plainText(b.label), x, y, width: w, height: h });
    if (vertical) y += h + M.gapButton;
    else x += w + M.gapButton;
  });

  return {
    vertical,
    width: Math.ceil(boxW + menu.pad.l + menu.pad.r),
    height: Math.ceil(boxH + menu.pad.t + menu.pad.b),
    xanchor: resolveXAnchor(menu.xanchor, menu.x),
    yanchor: resolveYAnchor(menu.yanchor, menu.y),
    ...(header ? { header } : {}),
    items,
    scale: s,
  };
}

/** Top-left corner of a menu's padded box, container px (`plotArea` in container px too). */
export function placeUpdatemenu(
  menu: FullUpdatemenu,
  layout: MenuLayout,
  size: { width: number; height: number },
  plotArea: Readonly<ViewportRect>,
): { left: number; top: number } {
  const o = anchoredOrigin(menuAnchor(menu, layout.xanchor, layout.yanchor), size, plotArea, {
    width: layout.width,
    height: layout.height,
  });
  return { left: Math.round(o.left), top: Math.round(o.top) };
}

function menuAnchor(
  menu: FullUpdatemenu,
  xanchor: AnchoredBox['xanchor'],
  yanchor: AnchoredBox['yanchor'],
): AnchoredBox {
  return { x: menu.x, y: menu.y, xref: 'paper', yref: 'paper', xanchor, yanchor };
}

/**
 * Margin a menu needs to stay inside the figure (Plotly pushes `autoMargin` with the padded box;
 * for dropdowns only the header counts, the open list overlaps the chart).
 */
export function updatemenuMarginPush(
  menu: FullUpdatemenu,
  layout: MenuLayout,
  size: { width: number; height: number },
  margin: { l: number; r: number; t: number; b: number },
): MarginPush | undefined {
  return anchoredMarginPush(menuAnchor(menu, layout.xanchor, layout.yanchor), size, margin, {
    width: layout.width,
    height: layout.height,
  });
}

/** Visible menus of a layout, in order. */
export function visibleUpdatemenus(menus: unknown): FullUpdatemenu[] {
  if (!Array.isArray(menus)) return [];
  return (menus as FullUpdatemenu[]).filter((m) => m.visible && m.buttons.some((b) => b.visible));
}
