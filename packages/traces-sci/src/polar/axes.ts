/**
 * What a polar subplot's axes draw (plan E11.4), following plotly.js `Polar.updateRadialAxis` and
 * `updateAngularAxis`: the background, the radial grid (circles, or polygons with
 * `gridshape: 'linear'`), the angular grid (spokes), the angular axis line (the subplot outline),
 * the radial axis line, ticks, tick labels and the radial axis title.
 *
 * {@link buildPolarScene} is pure and works in geometric px (center at the origin, y up); the
 * view maps it into the overlay.
 */
import { richTextLabel, toRGBA, type RGBAColor } from '@mk7s/holochart-core';
import type { TextFont, TextLabel } from '@mk7s/holochart-render';
import { deg2rad, gridLinePoints, mod, polygonScale, regionRings } from './geometry.ts';
import type { PolarSubplot } from './subplot.ts';

type Container = Record<string, unknown>;

/** Plotly's `MID_SHIFT`: a label's vertical middle, as a fraction of the font size. */
const MID_SHIFT = 0.35;

/** Polylines of one style, NaN-separated, in geometric px. */
export interface Strokes {
  readonly x: number[];
  readonly y: number[];
  readonly color: RGBAColor;
  readonly width: number;
  readonly dash: string;
}

/** Labels of one axis layer, anchored in geometric px (y up). */
export interface PolarLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: TextFont;
  readonly color: RGBAColor;
  readonly anchorX: 'left' | 'center' | 'right';
  readonly anchorY: 'baseline' | 'middle' | 'top' | 'bottom';
  /** Clockwise degrees on screen. */
  readonly angle: number;
  readonly runs?: TextLabel['runs'];
}

/** Everything drawn for one axis layer (`below` or `above` traces). */
export interface AxisLayer {
  readonly strokes: Strokes[];
  readonly labels: PolarLabel[];
}

export interface PolarScene {
  /** Background: region rings (counterclockwise outer, clockwise holes). */
  readonly background: { x: number[]; y: number[]; rings: number[]; color: RGBAColor } | null;
  readonly grid: Strokes[];
  readonly below: AxisLayer;
  readonly above: AxisLayer;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function color(v: unknown, fallback: RGBAColor = [0, 0, 0, 0]): RGBAColor {
  return (typeof v === 'string' ? toRGBA(v) : null) ?? fallback;
}

/** A layout font container → a text font (family, size, weight, style…). */
export function textFont(f: unknown, fallbackSize = 12): TextFont {
  const c = (f ?? {}) as Container;
  const font: TextFont = {
    family: typeof c['family'] === 'string' ? c['family'] : 'sans-serif',
    size: num(c['size'], fallbackSize),
  };
  if (typeof c['weight'] === 'number' || typeof c['weight'] === 'string') {
    font.weight = c['weight'] as TextFont['weight'];
  }
  if (c['style'] === 'italic') font.style = 'italic';
  if (typeof c['variant'] === 'string') font.variant = c['variant'] as TextFont['variant'];
  if (typeof c['textcase'] === 'string') font.textcase = c['textcase'] as TextFont['textcase'];
  if (typeof c['lineposition'] === 'string') {
    font.lineposition = c['lineposition'] as TextFont['lineposition'];
  }
  if (typeof c['shadow'] === 'string') font.shadow = c['shadow'];
  return font;
}

function label(
  text: string,
  x: number,
  y: number,
  fontIn: unknown,
  anchorX: PolarLabel['anchorX'],
  anchorY: PolarLabel['anchorY'],
  angle: number,
): PolarLabel {
  const f = (fontIn ?? {}) as Container;
  const base = textFont(f);
  const rich = richTextLabel(text, base, { newlines: 'break' });
  return {
    text: rich ? rich.text : text,
    x,
    y,
    font: rich ? rich.font : base,
    color: color(f['color'], [0, 0, 0, 1]),
    anchorX,
    anchorY,
    angle,
    ...(rich?.runs ? { runs: rich.runs } : {}),
  };
}

function strokes(c: unknown, width: unknown, dash: unknown): Strokes {
  return {
    x: [],
    y: [],
    color: color(c),
    width: num(width, 1),
    dash: typeof dash === 'string' ? dash : 'solid',
  };
}

function segment(s: Strokes, x0: number, y0: number, x1: number, y1: number): void {
  if (s.x.length > 0) {
    s.x.push(NaN);
    s.y.push(NaN);
  }
  s.x.push(x0, x1);
  s.y.push(y0, y1);
}

function polyline(s: Strokes, line: { x: number[]; y: number[] }): void {
  if (line.x.length < 2) return;
  if (s.x.length > 0) {
    s.x.push(NaN);
    s.y.push(NaN);
  }
  s.x.push(...line.x);
  s.y.push(...line.y);
}

/** Plotly's `labelStandoff` of `makeLabelFns`: past outside ticks, a fifth of the font, the line. */
function labelStandoff(axis: Container): number {
  const outside = axis['ticks'] === 'outside';
  const font = num((axis['tickfont'] as Container | undefined)?.['size'], 12);
  let standoff = outside ? num(axis['ticklen'], 5) : 0;
  if (axis['showticklabels'] === true && (outside || axis['showline'] === true)) {
    standoff += 0.2 * font;
  }
  return standoff + num(axis['linewidth'], 1) / 2;
}

/** The scene of one subplot (see the module comment). `bgcolor` etc. come from `polar`. */
export function buildPolarScene(sp: PolarSubplot, polar: Container): PolarScene {
  const radial = (polar['radialaxis'] ?? {}) as Container;
  const angular = (polar['angularaxis'] ?? {}) as Container;
  const region = sp.region;
  const { radius, innerRadius } = sp;
  const room = innerRadius < radius;
  const below: AxisLayer = { strokes: [], labels: [] };
  const above: AxisLayer = { strokes: [], labels: [] };
  const grid: Strokes[] = [];
  const layerOf = (axis: Container): AxisLayer =>
    axis['layer'] === 'below traces' ? below : above;

  const bg = regionRings(region);
  const background = { ...bg, color: color(polar['bgcolor']) };

  // ---- Radial axis --------------------------------------------------------------------------------
  const angleDeg = sp.radialAxisAngle;
  const a = deg2rad(angleDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Unit vector on the tick side of the radial axis: `clockwise` is below the axis in its frame.
  const side = radial['side'] === 'counterclockwise' ? 1 : -1;
  const nx = -sin * side;
  const ny = cos * side;
  if (room && radial['visible'] === true) {
    const ticks = sp.radialTicks();
    const [rl0, rl1] = sp.rl;
    const lo = Math.min(rl0, rl1);
    const hi = Math.max(rl0, rl1);
    const eps = Math.abs(hi - lo) * 1e-9;
    if (radial['showgrid'] === true) {
      const g = strokes(radial['gridcolor'], radial['gridwidth'], radial['griddash']);
      for (const t of ticks) {
        // Plotly's `clipEnds`: no grid line on the range ends (the outline and the center).
        if (!(t.v > lo + eps && t.v < hi - eps)) continue;
        const line = { x: [] as number[], y: [] as number[] };
        gridLinePoints(region, t.at, line);
        polyline(g, line);
      }
      grid.push(g);
    }
    const layer = layerOf(radial);
    if (radial['showline'] === true) {
      const l = strokes(radial['linecolor'], radial['linewidth'], 'solid');
      segment(l, innerRadius * cos, innerRadius * sin, radius * cos, radius * sin);
      layer.strokes.push(l);
    }
    const tickDir = radial['ticks'] === 'inside' ? -1 : radial['ticks'] === 'outside' ? 1 : 0;
    if (tickDir !== 0) {
      const len = num(radial['ticklen'], 5) * tickDir;
      const t = strokes(radial['tickcolor'], radial['tickwidth'], 'solid');
      for (const tick of ticks) {
        const px = tick.at * cos;
        const py = tick.at * sin;
        segment(t, px, py, px + nx * len, py + ny * len);
      }
      layer.strokes.push(t);
    }
    if (radial['showticklabels'] === true) {
      const font = (radial['tickfont'] ?? {}) as Container;
      const size = num(font['size'], 12);
      const standoff = labelStandoff(radial);
      // Readable left to right: flipped when the subplot starts in the left half (Plotly).
      const a0 = mod(sp.sectorDeg[0], 360);
      const tickangle = radial['tickangle'];
      const extra = typeof tickangle === 'number' ? tickangle : a0 > 90 && a0 <= 270 ? 180 : 0;
      const textAngle = -angleDeg + extra;
      // Upside-down labels hang from the other edge.
      const hang = side < 0 !== (mod(extra, 360) === 180);
      for (const tick of ticks) {
        if (tick.text === '') continue;
        const px = tick.at * cos + nx * standoff;
        const py = tick.at * sin + ny * standoff;
        const f = tick.fontScale ? { ...font, size: size * tick.fontScale } : font;
        layer.labels.push(
          label(tick.text, px, py, f, 'center', hang ? 'top' : 'bottom', textAngle),
        );
      }
      const title = (radial['title'] ?? {}) as Container;
      const text = typeof title['text'] === 'string' ? title['text'] : '';
      if (text !== '') {
        const tfont = (title['font'] ?? {}) as Container;
        const ts = num(tfont['size'], 14);
        // Plotly: half way out, past the tick labels on the tick side.
        const h = standoff + size;
        const pad = side < 0 ? h + ts * 0.8 : h + ts * 0.4;
        const px = (radius / 2) * cos + nx * pad;
        const py = (radius / 2) * sin + ny * pad;
        layer.labels.push(
          label(text, px, py, tfont, 'center', side < 0 ? 'top' : 'bottom', -angleDeg),
        );
      }
    }
  }

  // ---- Angular axis -------------------------------------------------------------------------------
  const layer = layerOf(angular);
  if (angular['showline'] === true) {
    const l = strokes(angular['linecolor'], angular['linewidth'], 'solid');
    for (let k = 0; k < bg.rings.length; k++) {
      const start = bg.rings[k] as number;
      const end = (bg.rings[k + 1] as number | undefined) ?? bg.x.length;
      const ring = { x: bg.x.slice(start, end), y: bg.y.slice(start, end) };
      ring.x.push(ring.x[0] as number);
      ring.y.push(ring.y[0] as number);
      polyline(l, ring);
    }
    layer.strokes.push(l);
  }
  if (angular['visible'] === true) {
    const ticks = sp.angularTicks();
    if (angular['showgrid'] === true) {
      const g = strokes(angular['gridcolor'], angular['gridwidth'], angular['griddash']);
      for (const t of ticks) {
        const k = polygonScale(t.at, sp.vangles);
        const c = Math.cos(t.at);
        const s = Math.sin(t.at);
        segment(g, innerRadius * k * c, innerRadius * k * s, radius * k * c, radius * k * s);
      }
      grid.unshift(g);
    }
    const pad = num(angular['linewidth'], 1) / 2;
    const tickDir = angular['ticks'] === 'inside' ? -1 : angular['ticks'] === 'outside' ? 1 : 0;
    if (tickDir !== 0) {
      const len = num(angular['ticklen'], 5);
      const t = strokes(angular['tickcolor'], angular['tickwidth'], 'solid');
      for (const tick of ticks) {
        const c = Math.cos(tick.at);
        const s = Math.sin(tick.at);
        const r0 = radius + tickDir * pad;
        const r1 = r0 + tickDir * len;
        segment(t, r0 * c, r0 * s, r1 * c, r1 * s);
      }
      layer.strokes.push(t);
    }
    if (angular['showticklabels'] === true) {
      const font = (angular['tickfont'] ?? {}) as Container;
      const size = num(font['size'], 12);
      const standoff = labelStandoff(angular);
      const tickangle = angular['tickangle'];
      const angle = typeof tickangle === 'number' ? tickangle : 0;
      for (const tick of ticks) {
        if (tick.text === '') continue;
        const c = Math.cos(tick.at);
        const s = Math.sin(tick.at);
        // plotly.js' angular `labelFns`: anchored by side, the baseline pushed off the circle.
        const ff = s > 0 ? 0.2 : 1;
        const x = (radius + standoff) * c;
        const y = radius * s + s * (standoff + size * ff) - Math.abs(c) * size * MID_SHIFT;
        const anchorX = Math.abs(c) < 0.1 ? 'center' : c > 0 ? 'left' : 'right';
        layer.labels.push(label(tick.text, x, y, font, anchorX, 'baseline', angle));
      }
    }
  }
  return { background, grid, below, above };
}
