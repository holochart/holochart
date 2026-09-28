/**
 * `indicator` layout (plan E12.7): where the number, delta, title and gauge of a trace go in its
 * domain, following plotly.js `traces/indicator/plot.js` for every mode combination. Pure: it
 * returns texts, annular sectors and rects in container px (top-left origin, +y down) for the
 * renderer to draw.
 *
 * ## Numbers
 *
 * The number and the delta are laid out around one anchor (the delta above, below, left or right
 * of the number), then scaled together to fit: the domain box without a gauge, a circle inside
 * the angular gauge's hole (they sit on the gauge's baseline), or the right quarter of the domain
 * next to a bullet gauge. Plotly scales only when neither font has a size (`_scaleNumbers`), never
 * above the 80 px default, and keeps the smallest scale per layout key across redraws (its
 * `_cache*` values), so a counting-up number doesn't jitter: {@link IndicatorLayoutCache} holds
 * that state.
 *
 * ## Gauges
 *
 * An angular gauge is a half ring (radius `min(w / 2, h)`, inner radius 0.75 of it) whose flat
 * side is on the domain's middle line plus half the radius; values map to angles from 9 to 3
 * o'clock, clamped. The background, steps, value bar, threshold, outline and tick marks are all
 * annular sectors, drawn in that order: a band of thickness `t` is centered on the ring and `t`
 * of its width, outlines are strokes centered on the sector edges, and the threshold and tick
 * marks are strokes of zero-width sectors. A bullet gauge is the same stack of rects over the
 * domain's height, its axis along the bottom edge; the number takes the right quarter.
 */
import {
  computeTicks,
  createScale,
  richTextLabel,
  type FullAxis,
  type FullTrace,
  type Locale,
} from '@mk7s/holochart-core';
import {
  layoutTextRuns,
  measureText,
  type TextFont,
  type TextRunLines,
} from '@mk7s/holochart-render';
import type { IndicatorCalc } from './calc.ts';
import { INDICATOR } from './defaults.ts';
import {
  deltaColor,
  deltaText,
  numberText,
  valueFormatter,
  valueRange,
  type DeltaStyle,
} from './format.ts';

/** Plotly's `LINE_SPACING`: line advance of multi-line text, in font sizes. */
export const LINE_HEIGHT = 1.3;
/** Plotly's `MID_SHIFT`: half the cap height of an average font, in font sizes. */
const MID_SHIFT = 0.35;

type Align = 'left' | 'center' | 'right';
const POSITION: Record<Align, number> = { left: 0, center: 0.5, right: 1 };

/** A container-px rect (top-left origin). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One text of the indicator, anchored at its first baseline. */
export interface IndicatorText {
  readonly role: 'number' | 'delta' | 'title' | 'tick';
  readonly text: string;
  readonly runs?: TextRunLines;
  readonly x: number;
  readonly y: number;
  readonly font: TextFont;
  readonly color: string;
  readonly anchorX: Align;
  /** Clockwise, degrees. */
  readonly angle: number;
}

/**
 * An annular sector: center, radii (px) and angles in radians from 3 o'clock, counter-clockwise
 * (y up), as the arc primitive takes them. `fill` may be transparent (strokes).
 */
export interface GaugeArc {
  readonly cx: number;
  readonly cy: number;
  readonly r0: number;
  readonly r1: number;
  readonly a0: number;
  readonly a1: number;
  readonly fill: string;
  readonly border: string;
  readonly borderWidth: number;
}

/** A bullet gauge rect (container px), with a stroke centered on its edges. */
export interface GaugeRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly fill: string;
  readonly border: string;
  readonly borderWidth: number;
}

/** Everything an indicator draws. */
export interface IndicatorLayout {
  readonly texts: IndicatorText[];
  readonly arcs: GaugeArc[];
  readonly rects: GaugeRect[];
  /** Scale applied to the number and delta fonts (1 without fitting). */
  readonly numbersScale: number;
  /** The angular gauge: center (container px) and radius. */
  readonly angular?: { readonly cx: number; readonly cy: number; readonly radius: number };
  /** The bullet gauge: its axis from `x0` to `x1` along `y` (the domain's bottom edge). */
  readonly bullet?: { readonly x0: number; readonly x1: number; readonly y: number };
}

/**
 * State kept across layouts of one trace (Plotly's `_cachedeltaPos`, `_cachenumbersScale`,
 * `_cachenumbersTranslate`): each value is reset when its layout key changes.
 */
export type IndicatorLayoutCache = Map<string, { key: string; value: number }>;

/** Plotly's `cache`: combine `value` with the kept one by `fn`, resetting on a new key. */
function cached(
  cache: IndicatorLayoutCache,
  name: string,
  initial: number,
  value: number,
  key: string,
  fn: (a: number, b: number) => number,
): number {
  let entry = cache.get(name);
  if (!entry || entry.key !== key) {
    entry = { key, value: initial };
    cache.set(name, entry);
  }
  const keep = entry.value;
  const v = Number.isFinite(keep) ? (Number.isFinite(value) ? fn(keep, value) : keep) : value;
  entry.value = v;
  return v;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === 'object' ? (v as Obj) : {});
const num = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;
const str = (v: unknown, dflt = ''): string => (typeof v === 'string' ? v : dflt);

/** A defaulted font as a text-engine font, its size times `scale`. */
export function textFont(font: unknown, scale = 1): TextFont {
  const f = obj(font);
  const out: TextFont = {
    family: str(f['family'], 'sans-serif'),
    size: num(f['size'], 12) * scale,
  };
  const weight = f['weight'];
  if (typeof weight === 'number' || weight === 'normal' || weight === 'bold') out.weight = weight;
  if (f['style'] === 'italic' || f['style'] === 'normal') out.style = f['style'];
  return out;
}

/** A text's content (rich runs for Plotly pseudo-HTML) and its SVG-like box at the origin. */
interface Measured {
  readonly text: string;
  readonly runs?: TextRunLines;
  readonly font: TextFont;
  readonly width: number;
  /** Box relative to the anchor (first baseline at y = 0, +y down). */
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
}

/** Measure `text` anchored at `anchor` (Plotly's `measureText` / `Drawing.bBox`). */
export function measure(text: string, font: TextFont, anchor: Align = 'left'): Measured {
  const rich = richTextLabel(text, font, { newlines: 'break' });
  const content = rich ? rich.text : text;
  const f = rich ? (rich.font as TextFont) : font;
  let width: number;
  let ascent: number;
  let descent: number;
  let lines: number;
  if (rich?.runs) {
    const runs = rich.runs as unknown as TextRunLines;
    const l = layoutTextRuns(runs, { font: f, lineHeight: LINE_HEIGHT });
    width = l.width;
    lines = l.lineCount;
    const base = measureText('', f, LINE_HEIGHT);
    ascent = base.ascent;
    descent = base.descent;
    for (const item of l.items) {
      if (item.line === 0) ascent = Math.max(ascent, item.ascent + item.y);
      if (item.line === lines - 1) descent = Math.max(descent, item.descent);
    }
  } else {
    const m = measureText(content, f, LINE_HEIGHT);
    width = m.width;
    ascent = m.ascent;
    descent = m.descent;
    lines = m.lineCount;
  }
  const left = -width * POSITION[anchor];
  const top = -ascent;
  const bottom = descent + (lines - 1) * LINE_HEIGHT * f.size;
  return {
    text: content,
    ...(rich?.runs ? { runs: rich.runs as unknown as TextRunLines } : {}),
    font: f,
    width,
    left,
    right: left + width,
    top,
    bottom,
    height: bottom - top,
  };
}

/** Rescale a measured text's font (runs are re-resolved at the new size). */
function scaledText(
  source: string,
  font: TextFont,
  scale: number,
): { text: string; runs?: TextRunLines; font: TextFont } {
  const f = { ...font, size: font.size * scale };
  const rich = richTextLabel(source, f, { newlines: 'break' });
  if (!rich) return { text: source, font: f };
  return {
    text: rich.text,
    font: rich.font as TextFont,
    ...(rich.runs ? { runs: rich.runs as unknown as TextRunLines } : {}),
  };
}

/** Bounds of the number / delta block (Plotly's `numbersbBox`). */
interface Bounds {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Options of {@link layoutIndicator}. */
export interface IndicatorLayoutOptions {
  /** The trace's domain, container px. */
  readonly domain: Box;
  /**
   * Plot area width (px): the length of Plotly's mock axes, which sets the rounding of
   * unformatted numbers and the tick density of the gauge axis.
   */
  readonly plotWidth: number;
  /** Kept state across redraws (see {@link IndicatorLayoutCache}); default: none. */
  readonly cache?: IndicatorLayoutCache;
  /** The chart's locale (plan E17.6), for numbers and gauge ticks; default en-US. */
  readonly locale?: Locale;
}

/** The gauge axis as a loose cartesian axis for the core tick functions. */
function gaugeAxis(trace: FullTrace, locale: Locale | undefined): Obj {
  return { ...obj(obj(trace['gauge'])['axis']), _id: 'x', type: 'linear', _locale: locale };
}

/** Major tick values and labels of the gauge axis, `length` px long. */
export function gaugeTicks(
  trace: FullTrace,
  length: number,
  locale?: Locale,
): { l: number; text: string }[] {
  const axis = gaugeAxis(trace, locale);
  const range = valueRange(trace);
  const scale = createScale({ type: 'linear', range, length: Math.max(1, length) });
  return computeTicks(scale, axis as unknown as FullAxis)
    .filter((t) => t.minor !== true && t.noTick !== true)
    .map((t) => ({ l: t.l, text: t.text }));
}

/** Lay out one indicator (see the module notes). */
export function layoutIndicator(
  trace: FullTrace,
  calc: IndicatorCalc,
  options: IndicatorLayoutOptions,
): IndicatorLayout {
  const cache = options.cache ?? new Map();
  const { domain } = options;
  const size = { l: domain.x, t: domain.y, w: domain.width, h: domain.height };
  const centerX = size.l + size.w / 2;
  const centerY = size.t + size.h / 2;
  const hasNumber = trace['_hasNumber'] === true;
  const hasDelta = trace['_hasDelta'] === true;
  const hasGauge = trace['_hasGauge'] === true;
  const isAngular = hasGauge && trace['_isAngular'] === true;
  const isBullet = hasGauge && trace['_isBullet'] === true;
  const gauge = obj(trace['gauge']);
  const axis = obj(gauge['axis']);
  const range = valueRange(trace);

  const radius = Math.min(size.w / 2, size.h);
  const innerRadius = INDICATOR.innerRadius * radius;

  // Where the numbers go, and the box they fit in.
  const align = (str(trace['align']) || 'center') as Align;
  const anchor = align;
  let numbersX: number;
  let numbersY = centerY;
  let fit: (b: Bounds) => [number, string];
  if (isAngular) {
    numbersX = centerX;
    numbersY = centerY + radius / 2;
    const r = 0.9 * innerRadius;
    fit = (b) => [r / Math.sqrt((b.width / 2) ** 2 + b.height ** 2), String(r)];
  } else if (isBullet) {
    const p = 1 - INDICATOR.bulletNumberDomainSize + INDICATOR.bulletPadding;
    numbersX = size.l + (p + (1 - p) * POSITION[align]) * size.w;
    const w = (INDICATOR.bulletNumberDomainSize - INDICATOR.bulletPadding) * size.w;
    fit = (b) => [Math.min(w / b.width, size.h / b.height), `${w}x${size.h}`];
  } else {
    numbersX = size.l + POSITION[align] * size.w;
    fit = (b) => [Math.min(size.w / b.width, size.h / b.height), `${size.w}x${size.h}`];
  }

  const texts: IndicatorText[] = [];
  const numbersScale = layoutNumbers();
  const numbersTop = numbersScale.top;

  const arcs: GaugeArc[] = [];
  const rects: GaugeRect[] = [];
  let axisTop = NaN;
  let angularInfo: IndicatorLayout['angular'];
  let bulletInfo: IndicatorLayout['bullet'];
  if (isAngular) axisTop = layoutAngular();
  if (isBullet) layoutBullet();
  layoutTitle();

  return {
    texts,
    arcs,
    rects,
    numbersScale: numbersScale.scale,
    ...(angularInfo ? { angular: angularInfo } : {}),
    ...(bulletInfo ? { bullet: bulletInfo } : {}),
  };

  /** The number and delta (Plotly's `drawNumbers`). Returns the scale and the block's top. */
  function layoutNumbers(): { scale: number; top: number } {
    if (!hasNumber && !hasDelta) return { scale: 1, top: numbersY };
    const plotWidth = options.plotWidth;
    let key = str(trace['mode']) + str(trace['align']);
    let bn: Measured | undefined;
    let dl: Measured | undefined;
    let numberSource = '';
    let deltaSource = '';
    let deltaFill = '';
    const delta = obj(trace['delta']);
    if (hasDelta) {
      const style: DeltaStyle = {
        prefix: str(delta['prefix']),
        suffix: str(delta['suffix']),
        increasing: {
          symbol: str(obj(delta['increasing'])['symbol']),
          color: str(obj(delta['increasing'])['color']),
        },
        decreasing: {
          symbol: str(obj(delta['decreasing'])['symbol']),
          color: str(obj(delta['decreasing'])['color']),
        },
      };
      const format = valueFormatter(str(delta['valueformat']), range, plotWidth, options.locale);
      const value = delta['relative'] === true ? calc.relativeDelta : calc.delta;
      deltaSource = deltaText(value, format, style);
      deltaFill = deltaColor(calc.delta, style);
      const font = obj(delta['font']);
      dl = measure(deltaSource, textFont(font), anchor);
      key += `${str(delta['position'])}${String(font['size'])}${str(font['family'])}`;
      key += str(delta['valueformat']) + style.increasing.symbol + style.decreasing.symbol;
    }
    const number = obj(trace['number']);
    if (hasNumber) {
      const format = valueFormatter(str(number['valueformat']), range, plotWidth, options.locale);
      numberSource = numberText(calc.value, format, str(number['prefix']), str(number['suffix']));
      const font = obj(number['font']);
      bn = measure(numberSource, textFont(font), anchor);
      key += `${String(font['size'])}${str(font['family'])}${str(number['valueformat'])}`;
      key += str(number['suffix']) + str(number['prefix']);
    }

    // Place the delta relative to the number.
    let dx = 0;
    let dy = 0;
    let bounds: Bounds = (bn ?? dl) as Measured;
    if (bn && dl) {
      const pos = POSITION[align];
      const padding = 0.75 * num(obj(delta['font'])['size'], 12);
      const bnCenter = (bn.top + bn.bottom) / 2;
      const dlCenter = (dl.top + dl.bottom) / 2;
      switch (str(delta['position'], 'bottom')) {
        case 'left':
          dx = cached(
            cache,
            'deltaPos',
            0,
            -(bn.width * pos + dl.width * (1 - pos) + padding),
            key,
            Math.min,
          );
          dy = bnCenter - dlCenter;
          bounds = {
            width: bn.width + dl.width + padding,
            height: Math.max(bn.height, dl.height),
            left: dl.left + dx,
            right: bn.right,
            top: Math.min(bn.top, dl.top + dy),
            bottom: Math.max(bn.bottom, dl.bottom + dy),
          };
          break;
        case 'right':
          dx = cached(
            cache,
            'deltaPos',
            0,
            bn.width * (1 - pos) + dl.width * pos + padding,
            key,
            Math.max,
          );
          dy = bnCenter - dlCenter;
          bounds = {
            width: bn.width + dl.width + padding,
            height: Math.max(bn.height, dl.height),
            left: bn.left,
            right: dl.right + dx,
            top: Math.min(bn.top, dl.top + dy),
            bottom: Math.max(bn.bottom, dl.bottom + dy),
          };
          break;
        case 'top':
          dy = bn.top;
          bounds = {
            width: Math.max(bn.width, dl.width),
            height: bn.height + dl.height,
            left: Math.min(bn.left, dl.left),
            right: Math.max(bn.right, dl.right),
            top: bn.bottom - bn.height - dl.height,
            bottom: bn.bottom,
          };
          break;
        default:
          dy = dl.height;
          bounds = {
            width: Math.max(bn.width, dl.width),
            height: bn.height + dl.height,
            left: Math.min(bn.left, dl.left),
            right: Math.max(bn.right, dl.right),
            top: bn.bottom - bn.height,
            bottom: bn.bottom + dl.height,
          };
      }
    }

    // Scale to fit (never above the default size), then align.
    const [ratio, boxKey] = fit(bounds);
    key += boxKey;
    let scale = cached(cache, 'numbersScale', 1, ratio, key, Math.min);
    if (trace['_scaleNumbers'] !== true || !(scale > 0)) scale = 1;
    const translateY = isAngular
      ? numbersY - scale * bounds.bottom
      : numbersY - (scale * (bounds.top + bounds.bottom)) / 2;
    const ref = align === 'center' ? (bounds.left + bounds.right) / 2 : bounds[align];
    const translateX = cached(cache, 'numbersTranslate', 0, numbersX - scale * ref, key, Math.max);

    if (bn) {
      texts.push({
        role: 'number',
        ...scaledText(numberSource, bn.font, scale),
        x: translateX,
        y: translateY,
        color: str(obj(number['font'])['color'], '#444'),
        anchorX: anchor,
        angle: 0,
      });
    }
    if (dl) {
      texts.push({
        role: 'delta',
        ...scaledText(deltaSource, dl.font, scale),
        x: translateX + scale * dx,
        y: translateY + scale * dy,
        color: deltaFill,
        anchorX: anchor,
        angle: 0,
      });
    }
    return { scale, top: scale * bounds.top + translateY };
  }

  /** The angular gauge (Plotly's `drawAngularGauge`). Returns the top of its axis, px. */
  function layoutAngular(): number {
    const gx = centerX;
    const gy = centerY + radius / 2;
    angularInfo = { cx: gx, cy: gy, radius };
    const [min, max] = range;
    // d3 angles (0 at 12 o'clock, clockwise) from −π/2 to π/2, then the arc primitive's.
    const toAngle = (v: number): number => {
      const a = ((v - min) / (max - min)) * Math.PI - Math.PI / 2;
      return Math.PI / 2 - Math.min(Math.PI / 2, Math.max(-Math.PI / 2, a));
    };
    const mid = (innerRadius + radius) / 2;
    const band = (t: number): [number, number] => [
      mid - (t / 2) * (radius - innerRadius),
      mid + (t / 2) * (radius - innerRadius),
    ];
    const sector = (
      v0: number,
      v1: number,
      thickness: number,
      fill: string,
      line: Obj | undefined,
    ): void => {
      if (!Number.isFinite(v0) || !Number.isFinite(v1)) return;
      const [r0, r1] = band(thickness);
      const a0 = toAngle(v0);
      const a1 = toAngle(v1);
      if (fill && a0 !== a1) {
        arcs.push({ cx: gx, cy: gy, r0, r1, a0, a1, fill, border: '', borderWidth: 0 });
      }
      const width = num(line?.['width'], 0);
      const color = str(line?.['color']);
      if (width > 0 && color) arcs.push(strokeArc(gx, gy, r0, r1, a0, a1, width, color));
    };

    sector(min, max, 1, str(gauge['bgcolor']), undefined);
    for (const step of stepsOf(gauge)) {
      const r = step['range'] as number[];
      sector(r[0]!, r[1]!, num(step['thickness'], 1), str(step['color']), obj(step['line']));
    }
    const bar = obj(gauge['bar']);
    if (calc.value !== undefined) {
      sector(min, calc.value, num(bar['thickness'], 1), str(bar['color']), obj(bar['line']));
    }
    const threshold = obj(gauge['threshold']);
    const tv = threshold['value'];
    if (typeof tv === 'number' && Number.isFinite(tv)) {
      sector(tv, tv, num(threshold['thickness'], 0.85), '', obj(threshold['line']));
    }
    sector(min, max, 1, '', {
      color: gauge['bordercolor'],
      width: gauge['borderwidth'],
    });

    // Axis: radial tick marks and labels around the outer edge.
    if (axis['visible'] === false) return centerY - radius / 2;
    const ticks = gaugeTicks(trace, options.plotWidth, options.locale);
    let top = Infinity;
    const tickSide = axis['ticks'];
    const ticklen = num(axis['ticklen'], 5);
    const tickwidth = num(axis['tickwidth'], 1);
    if (tickSide === 'outside' || tickSide === 'inside') {
      const sgn = tickSide === 'inside' ? -1 : 1;
      const pad = 0.5;
      for (const t of ticks) {
        const a = toAngle(t.l);
        const rA = radius + sgn * pad;
        const rB = rA + sgn * ticklen;
        const w = tickwidth / Math.max(1e-6, (rA + rB) / 2);
        arcs.push({
          cx: gx,
          cy: gy,
          r0: Math.min(rA, rB),
          r1: Math.max(rA, rB),
          a0: a - w / 2,
          a1: a + w / 2,
          fill: str(axis['tickcolor'], '#444'),
          border: '',
          borderWidth: 0,
        });
        top = Math.min(top, gy - Math.max(rA, rB) * Math.sin(a));
      }
    }
    if (axis['showticklabels'] !== false) {
      const tickfont = obj(axis['tickfont']);
      const font = textFont(tickfont);
      const fs = font.size;
      const standoff = (tickSide === 'outside' ? ticklen : 0) + 0.2 * fs + 0.5;
      const angle = typeof axis['tickangle'] === 'number' ? axis['tickangle'] : 0;
      for (const t of ticks) {
        if (t.text === '') continue;
        const rad = toAngle(t.l);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const ff = sin > 0 ? 0.2 : 1;
        const x = gx + radius * cos + cos * standoff;
        const y = gy - radius * sin - sin * (standoff + fs * ff) + Math.abs(cos) * fs * MID_SHIFT;
        const anchorX: Align = Math.abs(cos) < 0.1 ? 'center' : cos > 0 ? 'left' : 'right';
        const m = measure(t.text, font, anchorX);
        texts.push({
          role: 'tick',
          text: m.text,
          ...(m.runs ? { runs: m.runs } : {}),
          x,
          y,
          font: m.font,
          color: str(tickfont['color'], '#444'),
          anchorX,
          angle,
        });
        top = Math.min(top, y + m.top);
      }
    }
    return Number.isFinite(top) ? top : centerY - radius / 2;
  }

  /** The bullet gauge (Plotly's `drawBulletGauge`). */
  function layoutBullet(): void {
    const withNumbers = hasNumber || hasDelta;
    const length = size.w * (withNumbers ? 1 - INDICATOR.bulletNumberDomainSize : 1);
    const x0 = size.l;
    const bottom = size.t + size.h;
    bulletInfo = { x0, x1: x0 + length, y: bottom };
    const [min, max] = range;
    const c2p = (v: number): number => ((v - min) / (max - min)) * length;
    const box = (
      from: number,
      width: number,
      thickness: number,
      fill: string,
      line: Obj | undefined,
    ): void => {
      if (!Number.isFinite(from) || !Number.isFinite(width)) return;
      const y0 = size.t + 0.5 * (1 - thickness) * size.h;
      rects.push({
        x0: x0 + from,
        y0,
        x1: x0 + from + width,
        y1: y0 + thickness * size.h,
        fill,
        border: str(line?.['color']),
        borderWidth: num(line?.['width'], 0),
      });
    };
    const span = (r0: number, r1: number) => [c2p(r0), Math.max(0, c2p(r1) - c2p(r0))] as const;

    box(...span(min, max), 1, str(gauge['bgcolor']), undefined);
    for (const step of stepsOf(gauge)) {
      const r = step['range'] as number[];
      box(...span(r[0]!, r[1]!), num(step['thickness'], 1), str(step['color']), obj(step['line']));
    }
    const bar = obj(gauge['bar']);
    if (calc.value !== undefined) {
      const width = Math.max(0, c2p(Math.min(max, calc.value)));
      box(0, width, num(bar['thickness'], 1), str(bar['color']), obj(bar['line']));
    }
    const threshold = obj(gauge['threshold']);
    const tv = threshold['value'];
    const tline = obj(threshold['line']);
    const tw = num(tline['width'], 1);
    if (typeof tv === 'number' && Number.isFinite(tv) && tw > 0) {
      const t = num(threshold['thickness'], 0.85);
      const x = x0 + c2p(tv);
      rects.push({
        x0: x - tw / 2,
        y0: size.t + ((1 - t) / 2) * size.h,
        x1: x + tw / 2,
        y1: size.t + (1 - (1 - t) / 2) * size.h,
        fill: str(tline['color'], '#444'),
        border: '',
        borderWidth: 0,
      });
    }
    box(...span(min, max), 1, '', {
      color: gauge['bordercolor'],
      width: gauge['borderwidth'],
    });

    // Axis along the bottom edge.
    if (axis['visible'] === false) return;
    const ticks = gaugeTicks(trace, length, options.locale);
    const tickSide = axis['ticks'];
    const ticklen = num(axis['ticklen'], 5);
    const tickwidth = num(axis['tickwidth'], 1);
    if (tickSide === 'outside' || tickSide === 'inside') {
      const sgn = tickSide === 'inside' ? -1 : 1;
      for (const t of ticks) {
        const p = c2p(t.l);
        // Plotly's `clipEnds`: inside ticks skip the gauge's ends.
        if (sgn < 0 && !(p > 1 && p < length - 1)) continue;
        const ya = bottom + 0.5 * sgn;
        const yb = ya + ticklen * sgn;
        rects.push({
          x0: x0 + p - tickwidth / 2,
          y0: Math.min(ya, yb),
          x1: x0 + p + tickwidth / 2,
          y1: Math.max(ya, yb),
          fill: str(axis['tickcolor'], '#444'),
          border: '',
          borderWidth: 0,
        });
      }
    }
    if (axis['showticklabels'] !== false) {
      const tickfont = obj(axis['tickfont']);
      const font = textFont(tickfont);
      const standoff = (tickSide === 'outside' ? ticklen : 0) + 0.2 * font.size + 0.5;
      const angle = typeof axis['tickangle'] === 'number' ? axis['tickangle'] : 0;
      for (const t of ticks) {
        if (t.text === '') continue;
        const m = measure(t.text, font, 'center');
        texts.push({
          role: 'tick',
          text: m.text,
          ...(m.runs ? { runs: m.runs } : {}),
          x: x0 + c2p(t.l),
          y: bottom + standoff + font.size,
          font: m.font,
          color: str(tickfont['color'], '#444'),
          anchorX: 'center',
          angle,
        });
      }
    }
  }

  /** The title (Plotly's title positioning in `plot`). */
  function layoutTitle(): void {
    const title = obj(trace['title']);
    const source = str(title['text']);
    if (source === '') return;
    const titleAlign = (str(title['align']) || 'center') as Align;
    const anchorX: Align = isBullet ? 'right' : titleAlign;
    const m = measure(source, textFont(title['font']), anchorX);
    let x = size.l + size.w * POSITION[titleAlign];
    let y: number;
    if (isAngular) y = axisTop - INDICATOR.titlePadding - m.bottom;
    else if (isBullet) {
      y = numbersY - (m.top + m.bottom) / 2;
      x = size.l - INDICATOR.bulletPadding * size.w;
    } else y = numbersTop - INDICATOR.titlePadding - m.bottom;
    texts.push({
      role: 'title',
      text: m.text,
      ...(m.runs ? { runs: m.runs } : {}),
      x,
      y,
      font: m.font,
      color: str(obj(title['font'])['color'], '#444'),
      anchorX,
      angle: 0,
    });
  }
}

/** Visible steps with a numeric range. */
function stepsOf(gauge: Obj): Obj[] {
  const steps = gauge['steps'];
  if (!Array.isArray(steps)) return [];
  return (steps as unknown[]).map(obj).filter((s) => {
    const r = s['range'];
    return (
      s['visible'] !== false &&
      Array.isArray(r) &&
      typeof r[0] === 'number' &&
      typeof r[1] === 'number'
    );
  });
}

/**
 * A stroke of `width` centered on the edges of a sector (an SVG stroke of Plotly's arc path): the
 * sector grown by half the width on every side, drawn as a border only. A zero-width sector (the
 * threshold) keeps its radii: SVG's miter joins turn back at its ends.
 */
function strokeArc(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  width: number,
  color: string,
): GaugeArc {
  const h = width / 2;
  const line = a0 === a1;
  const ir = line ? r0 : Math.max(0, r0 - h);
  const or = line ? r1 : r1 + h;
  const da = h / Math.max(1e-6, (r0 + r1) / 2);
  const lo = Math.min(a0, a1) - da;
  const hi = Math.max(a0, a1) + da;
  return {
    cx,
    cy,
    r0: ir,
    r1: or,
    a0: lo,
    a1: hi,
    fill: 'rgba(0, 0, 0, 0)',
    border: color,
    borderWidth: width,
  };
}
