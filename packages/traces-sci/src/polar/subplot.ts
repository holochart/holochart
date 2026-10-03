/**
 * One polar subplot as laid out for drawing (plan E11.4): the (r, θ) → px mapping shared by the
 * polar traces, the axes and the interactions. A port of the geometry of plotly.js `Polar`
 * (`updateLayout`, `doAutoRange`, the radial and angular `setConvert`s and tick setup).
 *
 * ## Coordinates
 *
 * - **Radial**: calc values are *linear* coordinates of the radial scale (log10 on log axes,
 *   category index, ms on date axes). {@link PolarSubplot.r2px} maps them to px from the center:
 *   `range[0]` at the hole's edge (`innerRadius`), `range[1]` on the outer circle. Values below
 *   `range[0]` stay at the hole's edge (Plotly's `rFilter`); values past `range[1]` land outside the
 *   circle and are clipped.
 * - **Angular**: calc values are radians on `linear` axes (whatever the trace `thetaunit`) and
 *   category indices on `category` axes. {@link PolarSubplot.c2g} maps them to geometric radians
 *   (counterclockwise from 3 o'clock) with `direction` and `rotation`; categories are spread over
 *   `period` (default: the category count) positions around the circle.
 * - **Tick values** (`t`): degrees on linear angular axes, category indices otherwise.
 *
 * A subplot is rebuilt after every layout pass (it holds the solved radial range and placement).
 * Interactions change its view in place ({@link PolarSubplot.setView}: radial range, rotation,
 * radial axis angle) and notify the views that draw from it, so drags redraw without a pipeline
 * run; the change is committed with a relayout when the drag ends.
 */
import {
  autorange,
  computeTicks,
  createScale,
  createTickFormatter,
  formatNumber,
  type AxisExtremes,
  type FullAxis,
  type FullLayout,
  type Scale,
  type Tick,
} from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import {
  deg2rad,
  isAngleInsideSector,
  isFullCircle,
  mod,
  normalizeSector,
  placeSubplot,
  rad2deg,
  regionTester,
  snapToVertexAngle,
  angleDelta,
  type PolarPlacement,
  type PolarRegion,
  type RegionTester,
} from './geometry.ts';

type Container = Record<string, unknown>;

/** Plotly's `roundAngles`: nice angular tick steps in degrees. */
const ROUND_ANGLES = [15, 30, 45, 90, 180] as const;

/** A tick of one polar axis, ready to draw. */
export interface PolarTick {
  /** Radial: linear coordinate. Angular: tick value (degrees or category index). */
  readonly v: number;
  /** Angular ticks: geometric angle (radians). Radial ticks: px from the center. */
  readonly at: number;
  readonly text: string;
  readonly fontScale?: number;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** The domain rect of `polar.domain` in the plot area (container px, top-left origin). */
export function domainRect(polar: Container, plotArea: Readonly<ViewportRect>): ViewportRect {
  const d = (polar['domain'] ?? {}) as { x?: unknown; y?: unknown };
  const pair = (v: unknown): [number, number] =>
    Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
      ? [v[0], v[1]]
      : [0, 1];
  const [x0, x1] = pair(d.x);
  const [y0, y1] = pair(d.y);
  return {
    x: plotArea.x + plotArea.width * x0,
    y: plotArea.y + plotArea.height * (1 - y1),
    width: plotArea.width * (x1 - x0),
    height: plotArea.height * (y1 - y0),
  };
}

/** Plotly's `num2frac`-based radian labels: `π`, `2π`, `<sup>1</sup>⁄<sub>2</sub>π`, …. */
export function radianLabel(deg: number): string {
  const num0 = deg / 180;
  if (num0 === 0) return '0';
  const almostEq = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6;
  const gcd = (a: number, b: number): number => (almostEq(b, 0) ? a : gcd(b, a % b));
  const x = Math.abs(num0);
  let precision = 1;
  while (!almostEq(Math.round(x * precision) / precision, x) && precision < 1e6) precision *= 10;
  const numerator = x * precision;
  const g = Math.abs(gcd(numerator, precision));
  const n = Math.round(numerator / g);
  const d = Math.round(precision / g);
  if (d >= 100) return formatNumber(deg2rad(deg), {});
  const sign = num0 < 0 ? '−' : '';
  if (d === 1) return sign + (n === 1 ? 'π' : `${n}π`);
  return `${sign}<sup>${n}</sup>⁄<sub>${d}</sub>π`;
}

/** Inputs of {@link buildPolarSubplot}. */
export interface PolarSubplotInput {
  readonly fullLayout: FullLayout;
  readonly id: string;
  /** Plot area inside the margins, container px. */
  readonly plotArea: Readonly<ViewportRect>;
  /** Radial extremes of the visible traces on the subplot. */
  readonly extremes: readonly AxisExtremes[];
}

/** The radial scale's type and categories for a subplot (what calc converts `r` with). */
export function radialScaleOf(polar: Container | undefined): Scale {
  const axis = (polar?.['radialaxis'] ?? {}) as Container;
  const type = axis['type'];
  const auto = axis['autorange'];
  const reversed = typeof auto === 'string' && auto.includes('reversed');
  return createScale({
    type: type === 'log' || type === 'date' || type === 'category' ? type : 'linear',
    categories: (axis['_categories'] as string[] | undefined) ?? [],
    range: reversed ? [1, 0] : [0, 1],
  });
}

/** How a subplot's angular axis converts `theta` (see the module comment). */
export interface AngularConvert {
  readonly type: 'linear' | 'category';
  readonly categories: readonly string[];
  /** Category name → index. */
  readonly index: ReadonlyMap<string, number>;
  /** Positions around the circle of a category axis (2π on linear axes). */
  readonly period: number;
}

export function angularConvertOf(polar: Container | undefined): AngularConvert {
  const axis = (polar?.['angularaxis'] ?? {}) as Container;
  const categories = (axis['_categories'] as string[] | undefined) ?? [];
  const type = axis['type'] === 'category' ? 'category' : 'linear';
  const period = num(axis['period'], 0);
  const index = new Map<string, number>();
  categories.forEach((c, i) => {
    if (!index.has(c)) index.set(c, i);
  });
  return {
    type,
    categories,
    index,
    period: type === 'category' ? Math.max(period, categories.length) || 1 : 2 * Math.PI,
  };
}

/** A polar subplot laid out (see the module comment). @experimental */
export class PolarSubplot {
  readonly id: string;
  /** The subplot's defaulted layout container (`fullLayout.polarN`) of the build. */
  readonly layout: Container;
  readonly radialAxis: Container;
  readonly angularAxis: Container;
  readonly placement: PolarPlacement;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly innerRadius: number;
  /** `sector`, sorted, in degrees and radians. */
  readonly sectorDeg: readonly [number, number];
  readonly sector: readonly [number, number];
  readonly full: boolean;
  readonly radialScale: Scale;
  readonly angular: AngularConvert;
  /** 1 counterclockwise, -1 clockwise. */
  readonly direction: 1 | -1;
  /** Plot area width (px), which sizes the angular axis' auto ticks as in Plotly. */
  readonly plotWidth: number;
  /** The radial range autorange / `range` gave (linear), before any interaction. */
  readonly initialRange: readonly [number, number];
  readonly initialRotation: number;
  readonly initialAngle: number;
  /** Incremented by every {@link setView}: views and caches compare it. */
  version = 0;

  #rl: [number, number];
  #rotation: number;
  #angle: number;
  #m = 1;
  #vangles: number[] | null = null;
  #tester: RegionTester | undefined;
  #listeners = new Set<() => void>();
  #radialTicks: { version: number; ticks: PolarTick[] } | undefined;
  #angularTicks: { version: number; ticks: PolarTick[] } | undefined;
  #hover: { r?: (l: number) => string; t?: (v: number) => string } = {};

  constructor(input: PolarSubplotInput) {
    const { fullLayout, id, plotArea } = input;
    const layout = (fullLayout[id] ?? {}) as Container;
    this.id = id;
    this.layout = layout;
    this.radialAxis = (layout['radialaxis'] ?? {}) as Container;
    this.angularAxis = (layout['angularaxis'] ?? {}) as Container;
    // The tick machinery reads the chart's locale from the axis (plan E17.6), as on cartesian ones.
    this.radialAxis['_locale'] = this.angularAxis['_locale'] = fullLayout._locale;
    this.plotWidth = plotArea.width;
    this.sectorDeg = normalizeSector(layout['sector'] as unknown[] | undefined);
    this.sector = [deg2rad(this.sectorDeg[0]), deg2rad(this.sectorDeg[1])];
    this.full = isFullCircle(this.sector);
    this.placement = placeSubplot(
      domainRect(layout, plotArea),
      this.sectorDeg,
      num(layout['hole'], 0),
    );
    this.cx = this.placement.cx;
    this.cy = this.placement.cy;
    this.radius = this.placement.radius;
    this.innerRadius = this.placement.innerRadius;
    this.angular = angularConvertOf(layout);
    this.direction = this.angularAxis['direction'] === 'clockwise' ? -1 : 1;

    // Radial range: autorange over the traces' extremes, else `range` (plotly.js `doAutoRange`).
    const scale = radialScaleOf(layout);
    scale.setLength(Math.max(1, this.radius - this.innerRadius));
    const axis = this.radialAxis;
    const userRange = axis['range'];
    const hasRange =
      Array.isArray(userRange) && userRange.some((v) => v !== null && v !== undefined);
    const auto = axis['autorange'];
    let rl: [number, number];
    if (auto === false && hasRange) {
      rl = [scale.r2l(userRange[0]), scale.r2l(userRange[1])];
      if (!Number.isFinite(rl[0]) || !Number.isFinite(rl[1]) || rl[0] === rl[1]) rl = [0, 1];
    } else if (input.extremes.length === 0) {
      rl = hasRange
        ? [scale.r2l((userRange as unknown[])[0]), scale.r2l((userRange as unknown[])[1])]
        : [0, 1];
      if (!Number.isFinite(rl[0]) || !Number.isFinite(rl[1]) || rl[0] === rl[1]) rl = [0, 1];
    } else {
      rl = autorange(input.extremes, scale, {
        ...axis,
        _id: 'x',
        ...(hasRange ? {} : { range: undefined }),
      } as unknown as FullAxis);
    }
    rl = clampAllowed(scale, rl, axis['minallowed'], axis['maxallowed']);
    scale.setRange(rl[0], rl[1]);
    this.radialScale = scale;
    this.#rl = rl;
    // The range in use, like Plotly writes it back (partial relayouts fill from it).
    axis['range'] = [scale.l2r(rl[0]), scale.l2r(rl[1])];
    this.initialRange = [rl[0], rl[1]];

    this.#rotation = num(this.angularAxis['rotation'], 0);
    this.#angle = num(axis['angle'], this.sectorDeg[0]);
    this.initialRotation = this.#rotation;
    this.initialAngle = this.#angle;
    this.#update();
  }

  /** Radial range in use (linear coordinates). */
  get rl(): readonly [number, number] {
    return this.#rl;
  }

  /** Angular rotation in use (degrees). */
  get rotation(): number {
    return this.#rotation;
  }

  /** Radial axis angle in use (degrees), before snapping to a polygon vertex. */
  get angle(): number {
    return this.#angle;
  }

  /** The radial axis' drawn angle in degrees (snapped to the nearest vertex on polygon grids). */
  get radialAxisAngle(): number {
    return this.#vangles
      ? rad2deg(snapToVertexAngle(deg2rad(this.#angle), this.#vangles))
      : this.#angle;
  }

  /** Polygon vertex angles (radians, counterclockwise) for `gridshape: 'linear'`, else null. */
  get vangles(): readonly number[] | null {
    return this.#vangles;
  }

  /** The subplot's region in geometric px (see `geometry.ts`). */
  get region(): PolarRegion {
    return this.tester.region;
  }

  get tester(): RegionTester {
    this.#tester ??= regionTester({
      r0: this.innerRadius,
      r1: this.radius,
      sector: this.sector,
      vangles: this.#vangles,
    });
    return this.#tester;
  }

  /** Radial linear coordinate → px from the center (NaN for NaN). */
  r2px(l: number): number {
    if (Number.isNaN(l)) return NaN;
    const d = l - this.#rl[0];
    const keep = this.#rl[0] > this.#rl[1] ? d <= 0 : d >= 0;
    return this.innerRadius + (keep ? d : 0) * this.#m;
  }

  /** Px from the center → radial linear coordinate (for zooms and hover). */
  px2r(px: number): number {
    return this.#rl[0] + (px - this.innerRadius) / this.#m;
  }

  /** Angular calc value → geometric radians. */
  c2g(c: number): number {
    const rad = this.angular.type === 'category' ? (c * 2 * Math.PI) / this.angular.period : c;
    return this.direction * rad + deg2rad(this.#rotation);
  }

  /** Geometric radians → angular calc value. */
  g2c(g: number): number {
    const rad = (g - deg2rad(this.#rotation)) / this.direction;
    return this.angular.type === 'category' ? (rad * this.angular.period) / (2 * Math.PI) : rad;
  }

  /** Angular tick value (degrees, or category index) → geometric radians. */
  t2g(t: number): number {
    return this.angular.type === 'category' ? this.c2g(t) : this.c2g(deg2rad(t));
  }

  /** Whether a point in geometric px is inside the subplot's region. */
  inside(x: number, y: number): boolean {
    return this.tester.inside(x, y);
  }

  /** Container px → geometric px. */
  toGeometric(x: number, y: number): [number, number] {
    return [x - this.cx, this.cy - y];
  }

  /**
   * Change the view (drags): the radial range (linear), the rotation or the radial axis angle
   * (degrees). Every listener is notified.
   */
  setView(view: { range?: readonly [number, number]; rotation?: number; angle?: number }): void {
    if (view.range) this.#rl = [view.range[0], view.range[1]];
    if (view.rotation !== undefined) this.#rotation = view.rotation;
    if (view.angle !== undefined) this.#angle = view.angle;
    this.radialScale.setRange(this.#rl[0], this.#rl[1]);
    this.version++;
    this.#update();
    for (const fn of [...this.#listeners]) fn();
  }

  /** Call `fn` after every {@link setView}; returns the unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #update(): void {
    const [rl0, rl1] = this.#rl;
    this.#m = (this.radius - this.innerRadius) / (rl1 - rl0 || 1);
    const polygon = this.layout['gridshape'] === 'linear' && this.angular.type === 'category';
    let vangles: number[] | null = null;
    if (polygon) {
      const ticks = this.#categoryTicks();
      vangles = ticks.map((t) => this.t2g(t.l));
      if (vangles.length >= 2 && angleDelta(vangles[0] as number, vangles[1] as number) < 0) {
        vangles.reverse();
      }
      if (vangles.length < 3) vangles = null;
    }
    this.#vangles = vangles;
    this.#tester = undefined;
  }

  // ---- Ticks ------------------------------------------------------------------------------------

  /** The radial axis options ticks are computed with (Plotly's `nticks` doubling for radial axes). */
  #radialTickAxis(): FullAxis {
    const axis = this.radialAxis;
    let nticks = num(axis['nticks'], 0);
    if (!nticks) {
      const len = this.radialScale.length;
      if (this.radialScale.type === 'category') {
        const size = num((axis['tickfont'] as Container | undefined)?.['size'], 12);
        nticks = len / Math.round(1.2 * size);
      } else {
        nticks = Math.min(9, Math.max(4, len / 80)) + 1;
      }
      nticks *= 2;
    }
    return { ...axis, _id: 'x', _name: 'radialaxis', nticks } as unknown as FullAxis;
  }

  /** Radial ticks (`at`: px from the center), cached per view. */
  radialTicks(): readonly PolarTick[] {
    if (this.#radialTicks?.version === this.version) return this.#radialTicks.ticks;
    const ticks: PolarTick[] = [];
    for (const t of computeTicks(this.radialScale, this.#radialTickAxis())) {
      if (t.minor || t.noTick) continue;
      ticks.push({
        v: t.l,
        at: this.r2px(t.l),
        text: t.text,
        ...(t.fontScale !== undefined ? { fontScale: t.fontScale } : {}),
      });
    }
    this.#radialTicks = { version: this.version, ticks };
    return ticks;
  }

  #angularLength(): number {
    return Math.max(1, this.plotWidth * Math.PI);
  }

  #categoryTicks(): Tick[] {
    const n = this.angular.categories.length;
    const scale = createScale({
      type: 'category',
      categories: this.angular.categories,
      range: [0, this.angular.period],
      length: this.#angularLength(),
    });
    const axis = { ...this.angularAxis, _id: 'angularaxis' } as unknown as FullAxis;
    return computeTicks(scale, axis).filter(
      (t) => !t.minor && !t.noTick && Number.isInteger(t.l) && t.l >= 0 && t.l < n,
    );
  }

  /** The linear angular axis' degree scale and tick options (Plotly's mocked angular range). */
  #degreeAxis(): { scale: Scale; axis: FullAxis } {
    const [s0, s1] = this.sector;
    const range: [number, number] = this.full
      ? [this.sectorDeg[0], this.sectorDeg[0] + 360]
      : [rad2deg(this.g2c(s0)), rad2deg(this.g2c(s1))];
    const scale = createScale({ type: 'linear', range, length: this.#angularLength() });
    const a = this.angularAxis;
    const radians = a['thetaunit'] === 'radians';
    const toDeg = (v: unknown): unknown => (radians && typeof v === 'number' ? rad2deg(v) : v);
    let axis: Container = { ...a, _id: 'angularaxis' };
    const mode = a['tickmode'];
    if (mode === 'auto' || mode === undefined || (mode === 'linear' && !a['dtick'])) {
      let nt = num(a['nticks'], 0);
      if (!nt) nt = Math.min(9, Math.max(4, scale.length / 80)) + 1;
      const rough = Math.abs(range[1] - range[0]) / nt;
      const dtick = ROUND_ANGLES.find((v) => v >= rough) ?? 180;
      axis = { ...axis, tickmode: 'linear', tick0: 0, dtick };
    } else if (mode === 'linear') {
      axis = { ...axis, tick0: toDeg(a['tick0']), dtick: toDeg(a['dtick']) };
    }
    return { scale, axis: axis as unknown as FullAxis };
  }

  /** Angular ticks (`at`: geometric radians), cached per view. */
  angularTicks(): readonly PolarTick[] {
    if (this.#angularTicks?.version === this.version) return this.#angularTicks.ticks;
    const out: PolarTick[] = [];
    if (this.angular.type === 'category') {
      for (const t of this.#categoryTicks()) {
        const g = this.t2g(t.l);
        if (!isAngleInsideSector(g, this.sector)) continue;
        out.push({ v: t.l, at: g, text: t.text });
      }
    } else {
      const { scale, axis } = this.#degreeAxis();
      const radians = this.angularAxis['thetaunit'] === 'radians';
      const ticks = computeTicks(scale, axis).filter((t) => !t.minor && !t.noTick);
      // Over a full circle the last tick repeats the first.
      const first = ticks[0];
      const last = ticks[ticks.length - 1];
      if (
        this.full &&
        first &&
        last &&
        ticks.length > 1 &&
        Math.abs(mod(last.l - first.l + 1e-9, 360)) < 1e-6
      ) {
        ticks.pop();
      }
      for (const t of ticks) {
        const text = radians && !isArrayMode(axis) ? withAffixes(radianLabel(t.l), axis) : t.text;
        out.push({ v: t.l, at: this.t2g(t.l), text });
      }
    }
    this.#angularTicks = { version: this.version, ticks: out };
    return out;
  }

  // ---- Hover labels -----------------------------------------------------------------------------

  /** Hover text of a radial linear coordinate (Plotly `formatLabels`' `rLabel`). */
  rLabel(l: number): string {
    if (!Number.isFinite(l)) return '';
    this.#hover.r ??= (
      (f) => (v: number) =>
        f.label(v, true).text
    )(createTickFormatter(this.radialScale, this.#radialTickAxis()));
    return this.#hover.r(l);
  }

  /** Hover text of an angular calc value (`thetaLabel`: degrees with `°`, radians, or category). */
  thetaLabel(c: number): string {
    if (!Number.isFinite(c)) return '';
    if (this.angular.type === 'category') {
      return this.angular.categories[Math.round(c)] ?? String(c);
    }
    if (!this.#hover.t) {
      const { scale, axis } = this.#degreeAxis();
      const f = createTickFormatter(scale, axis);
      const radians = this.angularAxis['thetaunit'] === 'radians';
      this.#hover.t = radians
        ? (v) => f.label(v, true).text
        : (v) => f.label(rad2deg(v), true).text;
    }
    return this.#hover.t(c);
  }
}

function isArrayMode(axis: FullAxis): boolean {
  return (axis as unknown as Container)['tickmode'] === 'array';
}

function withAffixes(text: string, axis: FullAxis): string {
  const a = axis as unknown as Container;
  const prefix = typeof a['tickprefix'] === 'string' ? a['tickprefix'] : '';
  const suffix = typeof a['ticksuffix'] === 'string' ? a['ticksuffix'] : '';
  const show = (k: string): boolean => a[k] === undefined || a[k] === 'all';
  return (show('showtickprefix') ? prefix : '') + text + (show('showticksuffix') ? suffix : '');
}

/** `minallowed` / `maxallowed` (range units) applied to a radial range (Plotly). */
function clampAllowed(
  scale: Scale,
  rl: [number, number],
  minallowed: unknown,
  maxallowed: unknown,
): [number, number] {
  const out: [number, number] = [rl[0], rl[1]];
  const lo = rl[0] > rl[1] ? 1 : 0;
  const hi = lo === 1 ? 0 : 1;
  if (minallowed !== undefined && minallowed !== null) {
    const m = scale.r2l(minallowed);
    if (Number.isFinite(m)) out[lo] = Math.max(out[lo], m);
  }
  if (maxallowed !== undefined && maxallowed !== null) {
    const m = scale.r2l(maxallowed);
    if (Number.isFinite(m)) out[hi] = Math.min(out[hi], m);
  }
  return out;
}
