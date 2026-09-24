/**
 * `pie` cross-trace layout (plan E9.11, E4.5): what spans pies and depends on the solved layout,
 * run by the runtime after every layout pass (`TraceModule.crossTraceLayout`). Idempotent: it
 * recomputes everything from the calcs' own data each time.
 *
 * 1. Colors (Plotly's pie `crossTraceCalc`): one label → color map for all pies. Explicit
 *    `marker.colors` register first (trace order); other labels take the next `piecolorway` color
 *    (extended with lighter / darker copies by `extendpiecolors`), in slice order across traces.
 * 2. Areas (Plotly's `layoutAreas` + `groupScale`): each pie's center and radius in its domain,
 *    leaving room for an outside title and for the largest pull; pies sharing a `scalegroup` get
 *    areas proportional to their totals.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { DomainLayoutContext, DomainTraceEntry } from '@mk7s/holochart-runtime';
import type { PieCalc } from './calc.ts';
import { extendColors } from './helpers.ts';
import { titleBlockSize } from './text.ts';

/** The slice colorway of a figure: `piecolorway` (or `colorway`), extended when asked. */
export function pieColorway(fullLayout: FullLayout): readonly string[] {
  const way = fullLayout['piecolorway'];
  const base: readonly string[] =
    Array.isArray(way) && way.length > 0
      ? (way as string[])
      : fullLayout.colorway.length > 0
        ? fullLayout.colorway
        : ['#444'];
  return fullLayout['extendpiecolors'] === false ? base : extendColors(base);
}

/**
 * Resolve every slice color of `calcs` (in trace order) from one shared label → color map
 * (Plotly's `_piecolormap`). Returns the map.
 */
export function resolvePieColors(
  calcs: readonly PieCalc[],
  fullLayout: FullLayout,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const calc of calcs) {
    for (const s of calc.slices) {
      if (s.explicitColor !== null && !map.has(s.label)) map.set(s.label, s.explicitColor);
    }
  }
  const way = pieColorway(fullLayout);
  let count = 0;
  for (const calc of calcs) {
    for (const s of calc.slices) {
      if (s.explicitColor !== null) {
        s.color = s.explicitColor;
        continue;
      }
      let color = map.get(s.label);
      if (color === undefined) {
        color = way[count % way.length] as string;
        count++;
        map.set(s.label, color);
      }
      s.color = color;
    }
  }
  return map;
}

function titleOf(trace: FullTrace): { text: string; position: string } | undefined {
  const title = trace['title'] as { text?: unknown; position?: unknown } | undefined;
  const text = typeof title?.text === 'string' ? title.text : '';
  if (!text) return undefined;
  return { text, position: typeof title?.position === 'string' ? title.position : 'top center' };
}

/** Plotly's `getTitleSpace`: the title's height, at most half the domain. */
export function titleSpace(calc: PieCalc, domainHeight: number): number {
  return calc.titleBox ? Math.min(calc.titleBox.height, domainHeight / 2) : 0;
}

/** One pie of {@link layoutPieAreas}. */
export interface PieAreaEntry {
  readonly trace: FullTrace;
  readonly calc: PieCalc;
  /** Domain rect in container px. */
  readonly rect: Readonly<ViewportRect>;
}

/**
 * Centers and radii of pies (Plotly's `layoutAreas` + `groupScale`), written to `calc.layout`.
 * `calc.titleBox` must be set for pies with a title.
 */
export function layoutPieAreas(
  entries: readonly PieAreaEntry[],
  size: { readonly width: number; readonly height: number },
): void {
  const radii = entries.map(({ trace, calc, rect }) => {
    let height = rect.height;
    const title = titleOf(trace);
    if (title && title.position !== 'middle center') height -= titleSpace(calc, rect.height);
    const r = Math.max(0, Math.min(rect.width / 2, height / 2) / (1 + calc.maxPull));
    let cy = rect.y + rect.height - height / 2;
    if (title && title.position.includes('bottom')) cy -= titleSpace(calc, rect.height);
    return { cx: rect.x + rect.width / 2, cy, r };
  });

  // Scale groups: the same value per px² in every pie of the group (the smallest one wins).
  const groups = new Map<string, number>();
  entries.forEach(({ trace, calc }, k) => {
    const g = trace['scalegroup'];
    if (typeof g !== 'string' || g === '' || !(calc.vTotal > 0)) return;
    const r = radii[k]!.r;
    groups.set(g, Math.min(groups.get(g) ?? Infinity, (r * r) / calc.vTotal));
  });
  entries.forEach(({ trace, calc }, k) => {
    const g = trace['scalegroup'];
    const min = typeof g === 'string' ? groups.get(g) : undefined;
    if (min !== undefined && Number.isFinite(min) && calc.vTotal > 0) {
      radii[k]!.r = Math.sqrt(min * calc.vTotal);
    }
  });

  entries.forEach(({ calc, rect }, k) => {
    const { cx, cy, r } = radii[k]!;
    calc.layout = {
      cx,
      cy,
      r,
      width: size.width,
      height: size.height,
      domain: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
}

/** Measure the title block of every pie that has a title (Plotly's `prerenderTitles`). */
export function measureTitles(entries: readonly { trace: FullTrace; calc: PieCalc }[]): void {
  for (const { trace, calc } of entries) {
    const title = titleOf(trace);
    calc.titleBox = title ? titleBlockSize(trace, title.text) : null;
  }
}

/** The `crossTraceLayout` of `pie`: colors, then areas (see the module comment). */
export function crossTraceLayoutPie(
  entries: readonly DomainTraceEntry<PieCalc>[],
  ctx: DomainLayoutContext,
): void {
  resolvePieColors(
    entries.map((e) => e.calc),
    ctx.fullLayout,
  );
  measureTitles(entries);
  layoutPieAreas(
    entries.map((e) => ({ trace: e.trace, calc: e.calc, rect: e.domain.rect })),
    { width: ctx.width, height: ctx.height },
  );
}
