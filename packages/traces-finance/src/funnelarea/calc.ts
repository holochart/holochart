/**
 * `funnelarea` calc and cross-trace layout (plan E12.6), ported from plotly.js'
 * `funnelarea/calc.js` (pie's calc and colors) and `funnelarea/plot.js` (`setCoords`), with pie's
 * `layoutAreas` / `groupScale` for funnel areas.
 *
 * ## Calc
 *
 * Pie's slice aggregation (merged duplicate labels, `hiddenlabels`, values or counts): one stage
 * per label, in data order — sorted by value only when labels were merged (Plotly).
 *
 * ## Geometry
 *
 * The stages are trapezoids stacked into a triangle cut at `baseratio`: the first stage on top,
 * widest. With `h = baseratio` (at most 0.999) the stack starts from a virtual tip area
 * `v0 = total · h² / (1 − h²)`, and a stage's lower and upper edges sit at the square roots of the
 * running areas before and after it, so each trapezoid's area is proportional to its value. The
 * shape is centered vertically, its top edge spans the domain's radius `r` either side of the
 * center and its height is `2 · r · aspectratio`.
 *
 * Coordinates are container px (top-left origin, y down, like Plotly's SVG), relative to the
 * center (`cx`, `cy`).
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { CalcContext, DomainLayoutContext, DomainTraceEntry } from '@mk7s/holochart-runtime';
import {
  aggregateSlices,
  extendColors,
  labelContent,
  measureLabel,
  type PieCalc,
  type PieSlice,
} from '@mk7s/holochart-traces-basic';

/** A point relative to the funnel's center, container px (y down). */
export type Corner = readonly [number, number];

/**
 * One stage: pie's slice (angles unused) plus its trapezoid, set by the cross-trace layout.
 * @experimental
 */
export interface FunnelareaSlice extends PieSlice {
  /** Top-left, top-right, bottom-right and bottom-left corners (the top edge is wider). */
  corners: { tl: Corner; tr: Corner; br: Corner; bl: Corner } | undefined;
}

/**
 * Funnelarea calcdata: pie-shaped (so pie's labels and hover read it) plus the stage shapes.
 * @experimental
 */
export interface FunnelareaCalc extends PieCalc {
  readonly slices: FunnelareaSlice[];
  /** Half the funnel's height (Plotly's `r` after `setCoords`); `layout.r` is half its width. */
  halfHeight: number;
}

/** Line height of labels and titles (as bar and pie). */
export const LINE_HEIGHT = 1.2;

/** Funnelarea calc: stages from pie's aggregation, in data order unless labels were merged. */
export function calcFunnelarea(
  trace: FullTrace,
  ctx: Pick<CalcContext, 'fullLayout'>,
): FunnelareaCalc {
  const points = aggregateSlices({ ...trace, sort: false }, ctx.fullLayout['hiddenlabels']);
  // Plotly sorts funnel areas (by value, descending) only when duplicate labels were merged.
  if (points.some((p) => p.pts.length > 1)) points.sort((a, b) => b.v - a.v);
  let vTotal = 0;
  for (const p of points) if (!p.hidden) vTotal += p.v;
  const slices: FunnelareaSlice[] = points.map((p) => ({
    label: p.label,
    v: p.v,
    i: p.i,
    pts: p.pts,
    hidden: p.hidden,
    explicitColor: p.explicitColor,
    color: p.explicitColor ?? '',
    pull: 0,
    startAngle: NaN,
    stopAngle: NaN,
    midAngle: NaN,
    halfAngle: NaN,
    rInscribed: 0,
    corners: undefined,
  }));
  return { slices, vTotal, ring: 1, maxPull: 0, titleBox: null, layout: undefined, halfHeight: 0 };
}

/** The stage colorway: `funnelareacolorway` (or `colorway`), extended when asked. */
export function funnelareaColorway(fullLayout: FullLayout): readonly string[] {
  const way = fullLayout['funnelareacolorway'];
  const base: readonly string[] =
    Array.isArray(way) && way.length > 0
      ? (way as string[])
      : fullLayout.colorway.length > 0
        ? fullLayout.colorway
        : ['#444'];
  return fullLayout['extendfunnelareacolors'] === false ? base : extendColors(base);
}

/**
 * Resolve every stage color of `calcs` (in trace order) from one label → color map shared by all
 * funnel areas (Plotly's `_funnelareacolormap`): explicit `marker.colors` first, then the next
 * colorway color per new label.
 */
export function resolveFunnelareaColors(
  calcs: readonly FunnelareaCalc[],
  fullLayout: FullLayout,
): void {
  const map = new Map<string, string>();
  for (const calc of calcs) {
    for (const s of calc.slices) {
      if (s.explicitColor !== null && !map.has(s.label)) map.set(s.label, s.explicitColor);
    }
  }
  const way = funnelareaColorway(fullLayout);
  let count = 0;
  for (const calc of calcs) {
    for (const s of calc.slices) {
      if (s.explicitColor !== null) {
        s.color = s.explicitColor;
        continue;
      }
      let color = map.get(s.label);
      if (color === undefined) {
        color = way[count % way.length]!;
        count++;
        map.set(s.label, color);
      }
      s.color = color;
    }
  }
}

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The title text of a trace, or `''`. */
export function titleText(trace: FullTrace): string {
  const text = (trace['title'] as { text?: unknown } | undefined)?.text;
  return typeof text === 'string' ? text : '';
}

/** The title font of a trace (its `title.font`, fully defaulted). */
export function titleFont(trace: FullTrace) {
  const f = ((trace['title'] as { font?: Record<string, unknown> } | undefined)?.font ??
    {}) as Record<string, unknown>;
  const weight = f['weight'];
  return {
    family: typeof f['family'] === 'string' ? f['family'] : 'sans-serif',
    size: numberOr(f['size'], 12),
    ...(weight === 'normal' || weight === 'bold' || typeof weight === 'number'
      ? { weight: weight as number | 'normal' | 'bold' }
      : {}),
    ...(f['style'] === 'italic' ? { style: 'italic' as const } : {}),
  };
}

/** Plotly's `getTitleSpace`: the title's height, at most half the domain. */
function titleSpace(calc: FunnelareaCalc, domainHeight: number): number {
  return calc.titleBox ? Math.min(calc.titleBox.height, domainHeight / 2) : 0;
}

/** One funnel area of {@link layoutFunnelareas}. */
export interface FunnelareaEntry {
  readonly trace: FullTrace;
  readonly calc: FunnelareaCalc;
  /** Domain rect in container px. */
  readonly rect: Readonly<ViewportRect>;
}

/**
 * Centers and radii (Plotly's `layoutAreas` + `groupScale` for funnel areas), then each stage's
 * trapezoid (`setCoords`), written to the calcs. Titles must be measured (`calc.titleBox`).
 */
export function layoutFunnelareas(
  entries: readonly FunnelareaEntry[],
  size: { readonly width: number; readonly height: number },
): void {
  const areas = entries.map(({ trace, calc, rect }) => {
    let height = rect.height;
    if (titleText(trace)) height -= titleSpace(calc, rect.height);
    const aspect = numberOr(trace['aspectratio'], 1);
    const grouped = typeof trace['scalegroup'] === 'string' && trace['scalegroup'] !== '';
    const ry = height / 2 / (grouped ? 1 : aspect);
    return {
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height - height / 2,
      r: Math.max(0, Math.min(rect.width / 2, ry)),
    };
  });

  // Scale groups: the same value per px² in every funnel area of the group (the smallest wins).
  const groups = new Map<string, number>();
  const area = (trace: FullTrace, r: number): number => {
    const aspect = numberOr(trace['aspectratio'], 1);
    const [rx, ry] = aspect > 1 ? [r, r / aspect] : [r * aspect, r];
    return rx * ((1 + numberOr(trace['baseratio'], 0.333)) / 2) * ry;
  };
  entries.forEach(({ trace, calc }, k) => {
    const g = trace['scalegroup'];
    if (typeof g !== 'string' || g === '' || !(calc.vTotal > 0)) return;
    groups.set(g, Math.min(groups.get(g) ?? Infinity, area(trace, areas[k]!.r) / calc.vTotal));
  });
  entries.forEach(({ trace, calc }, k) => {
    const g = trace['scalegroup'];
    const min = typeof g === 'string' ? groups.get(g) : undefined;
    if (min === undefined || !Number.isFinite(min) || !(calc.vTotal > 0)) return;
    const v =
      (min * calc.vTotal) /
      ((1 + numberOr(trace['baseratio'], 0.333)) / 2) /
      numberOr(trace['aspectratio'], 1);
    areas[k]!.r = Math.sqrt(v);
  });

  entries.forEach(({ trace, calc, rect }, k) => {
    const { cx, cy, r } = areas[k]!;
    calc.layout = {
      cx,
      cy,
      r,
      width: size.width,
      height: size.height,
      domain: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
    setCoords(trace, calc, r);
  });
}

/** Plotly's `setCoords`: each visible stage's trapezoid (see the module comment). */
export function setCoords(trace: FullTrace, calc: FunnelareaCalc, r: number): void {
  const slices = calc.slices;
  for (const s of slices) s.corners = undefined;
  calc.halfHeight = 0;
  const total = calc.vTotal;
  if (!(total > 0) || !(r > 0)) return;
  const h = Math.min(numberOr(trace['baseratio'], 0.333), 0.999);
  const h2 = h * h;
  let sum = (total * h2) / (1 - h2) / total;
  const points: [number, number][] = [[Math.sqrt(sum), -Math.sqrt(sum)]];
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i]!;
    if (s.hidden) continue;
    sum += s.v / total;
    points.push([Math.sqrt(sum), -Math.sqrt(sum)]);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const rY = (maxY - minY) / 2;
  const lastX = points[points.length - 1]![0];
  const scaleX = r / lastX;
  const scaleY = rY > 0 ? (r / rY) * numberOr(trace['aspectratio'], 1) : 0;
  calc.halfHeight = scaleY * rY;
  const scaled = points.map(([x, y]) => [x * scaleX, (y - (maxY + minY) / 2) * scaleY] as const);
  let prevLeft: Corner = [-scaled[0]![0], scaled[0]![1]];
  let prevRight: Corner = [scaled[0]![0], scaled[0]![1]];
  let n = 0;
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i]!;
    if (s.hidden) continue;
    n++;
    const [x, y] = scaled[n]!;
    const tl: Corner = [-x, y];
    const tr: Corner = [x, y];
    s.corners = { tl, tr, br: prevRight, bl: prevLeft };
    prevLeft = tl;
    prevRight = tr;
  }
}

/** Measure the title block of every funnel area that has one (Plotly's `prerenderTitles`). */
export function measureTitles(entries: readonly { trace: FullTrace; calc: FunnelareaCalc }[]) {
  for (const { trace, calc } of entries) {
    const text = titleText(trace);
    calc.titleBox = text ? measureLabel(labelContent(text, titleFont(trace)), LINE_HEIGHT) : null;
  }
}

/** The `crossTraceLayout` of `funnelarea`: colors, titles, then areas and stages. */
export function crossTraceLayoutFunnelarea(
  entries: readonly DomainTraceEntry<FunnelareaCalc>[],
  ctx: DomainLayoutContext,
): void {
  resolveFunnelareaColors(
    entries.map((e) => e.calc),
    ctx.fullLayout,
  );
  measureTitles(entries);
  layoutFunnelareas(
    entries.map((e) => ({ trace: e.trace, calc: e.calc, rect: e.domain.rect })),
    { width: ctx.width, height: ctx.height },
  );
}
