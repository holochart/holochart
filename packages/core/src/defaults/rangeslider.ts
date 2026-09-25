/**
 * Defaults of the range slider and range selector (plan E5.9; plotly.js
 * `components/rangeslider/defaults.js`, `components/rangeselector/defaults.js`) that depend on
 * other values:
 *
 * - `rangeslider.visible` → `true` when the input axis has a `rangeslider` object; `bgcolor` →
 *   `plot_bgcolor`; `autorange` → `true` unless `range` is a full range; one `yaxis<N>`
 *   container per subplot on the axis, whose `rangemode` defaults to `fixed` with a valid
 *   `range`, else `match` (`range` is dropped for `match`);
 * - `rangeselector` (date axes only) `visible` → `true` when it has buttons; `activecolor` → `bgcolor` darkened by
 *   10 % (light) or lightened by 25 % (dark), Plotly's `Color.contrast`; `x` / `y` (both or
 *   neither, Plotly's `noneOrAll`; a template's when the input has neither) → the start of the
 *   axis domain and 0.02 above the highest
 *   domain of the y axes anchored to it; `font` → `layout.font` (see `axes.ts`);
 * - y axes anchored to an x axis with a visible range slider → `fixedrange: true`.
 *
 * Invisible containers are removed from the full layout (Plotly keeps an empty shell), so figures
 * without them default exactly as before. Every rule is idempotent: the output fed back in is a
 * fixed point.
 */
import { canonicalColor, toRGBA } from '../coerce/color.ts';
import { getIn } from '../path/path.ts';
import { keyForSubplotId, splitSubplotKey } from '../schema/walk.ts';
import type { ObjectNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import { coerceContainer } from './container.ts';
import type { FullAxis, FullLayout, Subplots } from './types.ts';

/** Paper-fraction gap between the range selector and the plot area top (Plotly's `yPad`). */
export const RANGESELECTOR_Y_PAD = 0.02;

/** A usable `[start, end]` range: two values that are neither `null` nor `undefined`. */
export function isFullRange(range: unknown): range is readonly [unknown, unknown] {
  return (
    Array.isArray(range) &&
    range.length === 2 &&
    range[0] !== null &&
    range[0] !== undefined &&
    range[1] !== null &&
    range[1] !== undefined
  );
}

/** RGB (0–1) → HSL (0–1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

/**
 * Plotly's `Color.contrast(color, lightAmount, darkAmount)` (tinycolor semantics): a dark color
 * lightened by `light` %, a light one darkened by `dark` % (HSL lightness), as `rgb()`.
 */
export function contrastShade(css: string, light: number, dark: number): string {
  const c = toRGBA(css);
  if (!c) return css;
  const [r, g, b] = c;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const [h, s, l] = rgbToHsl(r, g, b);
  const next = brightness < 0.5 ? Math.min(1, l + light / 100) : Math.max(0, l - dark / 100);
  const [nr, ng, nb] = hslToRgb(h, s, next);
  const ch = (v: number): number => Math.round(v * 255);
  return canonicalColor(`rgb(${ch(nr)}, ${ch(ng)}, ${ch(nb)})`) ?? css;
}

interface RangesliderOut {
  visible?: boolean;
  bgcolor?: string;
  autorange?: boolean;
  range?: unknown;
  [key: string]: unknown;
}

interface RangeselectorOut {
  visible?: boolean;
  buttons?: readonly unknown[];
  x?: number;
  y?: number;
  bgcolor?: string;
  activecolor?: string;
  [key: string]: unknown;
}

/**
 * Range-slider defaults of one coerced x axis that need only the axis itself (visibility, colors,
 * autorange). Run right after the axis is coerced, before its y axes are: their `fixedrange`
 * default reads `rangeslider.visible`.
 */
export function supplyRangesliderSelf(
  axIn: unknown,
  ax: FullAxis,
  fullLayout: Pick<FullLayout, 'plot_bgcolor'>,
): void {
  const out = ax as unknown as Record<string, unknown>;
  const rs = out['rangeslider'] as RangesliderOut | undefined;
  if (rs) {
    // Only the input decides (Plotly): a template cannot turn a slider on for every axis.
    const rsIn = getIn(axIn, 'rangeslider');
    const given = explicitVisible(rsIn);
    rs.visible = given ?? isPlainObject(rsIn);
    if (!rs.visible) hide(out, 'rangeslider', given);
    else {
      rs.bgcolor ??= fullLayout.plot_bgcolor;
      rs.autorange ??= !isFullRange(rs.range);
    }
  }
  const sel = out['rangeselector'] as RangeselectorOut | undefined;
  if (sel) {
    const given = explicitVisible(getIn(axIn, 'rangeselector'));
    // Date axes only (Plotly coerces the selector for date axes only).
    sel.visible =
      ax.type === 'date' && (given ?? (Array.isArray(sel.buttons) && sel.buttons.length > 0));
    if (!sel.visible) hide(out, 'rangeselector', given);
    else if (typeof sel.bgcolor === 'string')
      sel.activecolor ??= contrastShade(sel.bgcolor, 25, 10);
  }
}

/** The input container's own `visible`, when it is a boolean. */
function explicitVisible(containerIn: unknown): boolean | undefined {
  const v = isPlainObject(containerIn) ? containerIn['visible'] : undefined;
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Drop an invisible container, or keep `{ visible: false }` when the input said so (so the output
 * fed back in stays hidden whatever a template says).
 */
function hide(out: Record<string, unknown>, key: string, given: boolean | undefined): void {
  if (given === false) out[key] = { visible: false };
  else delete out[key];
}

/** Whether an x axis shows a range slider (after {@link supplyRangesliderSelf}). */
export function hasRangeslider(ax: unknown): boolean {
  return (ax as { rangeslider?: { visible?: unknown } } | undefined)?.rangeslider?.visible === true;
}

/**
 * Defaults that need every axis: the range selector's position and the range slider's per-subplot
 * `yaxis<N>` containers. Run once all axes are coerced.
 */
export function supplyRangeControls(
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout,
  subplots: Subplots,
  templateLayout: Record<string, unknown> | undefined,
  xaxisNode: ObjectNode,
): void {
  const rsNode = xaxisNode.children['rangeslider'];
  const yNode =
    rsNode?.kind === 'object' && rsNode.children['yaxis']?.kind === 'object'
      ? (rsNode.children['yaxis'] as ObjectNode)
      : undefined;
  for (const id of subplots.xaxis) {
    const key = keyForSubplotId(id, 'xaxis', 'x');
    const ax = fullLayout[key] as (FullAxis & Record<string, unknown>) | undefined;
    if (!ax) continue;
    const axIn = layoutIn[key];
    const tmpl = templateLayout?.[key] ?? templateLayout?.['xaxis'];
    const counters = subplots.cartesian
      .filter((sp) => sp.startsWith(id) && /^y\d*$/.test(sp.slice(id.length)))
      .map((sp) => sp.slice(id.length));

    const sel = ax['rangeselector'] as RangeselectorOut | undefined;
    if (sel?.visible === true) {
      // Plotly's `noneOrAll`: a lone input `x` or `y` is ignored. Without either, a template's
      // position applies (the default look puts the buttons at the top right).
      const given = (v: unknown): boolean => v !== undefined && v !== null;
      const xGiven = given(getIn(axIn, 'rangeselector.x'));
      const yGiven = given(getIn(axIn, 'rangeselector.y'));
      if (!xGiven || !yGiven || typeof sel.x !== 'number' || typeof sel.y !== 'number') {
        const templated = !xGiven && !yGiven;
        let top = 0;
        for (const yid of subplots.yaxis) {
          const ya = fullLayout[keyForSubplotId(yid, 'yaxis', 'y')] as FullAxis | undefined;
          if (ya?.anchor === id) top = Math.max(top, ya.domain[1] ?? 1);
        }
        sel.x = templated && typeof sel.x === 'number' ? sel.x : (ax.domain[0] ?? 0);
        sel.y = templated && typeof sel.y === 'number' ? sel.y : top + RANGESELECTOR_Y_PAD;
      }
    }

    const rs = ax['rangeslider'] as RangesliderOut | undefined;
    if (rs?.visible !== true || !yNode) continue;
    for (const k of Object.keys(rs)) {
      if (/^yaxis\d*$/.test(k)) delete rs[k];
    }
    for (const yid of counters) {
      const yName = keyForSubplotId(yid, 'yaxis', 'y');
      const cIn = getIn(axIn, `rangeslider.${yName}`);
      const [, n] = splitSubplotKey(yName);
      const cTmpl =
        getIn(tmpl, `rangeslider.${yName}`) ??
        (n > 1 ? getIn(tmpl, 'rangeslider.yaxis') : undefined);
      const out = coerceContainer(
        yNode,
        cIn,
        {},
        {
          template: cTmpl,
          overrides: { rangemode: isFullRange(getIn(cIn, 'range')) ? 'fixed' : 'match' },
        },
      );
      if (out['rangemode'] === 'match' || !isFullRange(out['range'])) delete out['range'];
      rs[yName] = out;
    }
  }
}
