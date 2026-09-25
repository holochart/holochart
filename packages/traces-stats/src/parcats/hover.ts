/**
 * `parcats` hover (plan E10.11, E6.1), after plotly.js' `parcats/parcats.js` hover handlers. The
 * trace is a domain trace: the runtime asks it with the pointer in container px and it returns
 * what is under it with distance 0 —
 *
 * - a path ribbon between two dimensions: its count and probability (`line.hovertemplate`);
 * - a category band, per `hoveron`: the category (`'category'`), the colored band under the
 *   pointer with its conditional probabilities (`'color'`), or every category of the dimension
 *   (`'dimension'`, one label each).
 *
 * The label text is built here from the `hoverinfo` flags (`count`, `probability`); a trace
 * `hovertemplate` (applied by the runtime) gets the same values as `fields`. The view highlights
 * what {@link highlightOf} returns.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  formatTemplate,
  splitExtra,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { traceRect } from '../parcoords/common.ts';
import type { ParcatsCalc } from './calc.ts';
import {
  DIM_WIDTH,
  hitTest,
  layoutFor,
  type CatBox,
  type DimBox,
  type ParcatsHit,
  type ParcatsLayout,
} from './layout.ts';

/** Label color of category hovers (Plotly's light grey). */
const CATEGORY_COLOR = '#d3d3d3';

/** The `hoverinfo` flags in use (empty for `none` / `skip`). */
function flagsOf(trace: FullTrace): Set<string> {
  const info = trace['hoverinfo'];
  if (info === 'none' || info === 'skip') return new Set();
  if (typeof info !== 'string' || info === 'all') return new Set(['count', 'probability']);
  return new Set(info.split('+'));
}

const p3 = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : 'NaN');

/** A label point in container px (converted by the caller). */
interface Label {
  x: number;
  y: number;
  text: string;
  color: string;
  fields: Record<string, unknown>;
  inds: readonly number[];
}

/** Anchor of a category's label: its right edge, the left edge in the last of several dims. */
function edgeX(layout: ParcatsLayout, dim: DimBox): number {
  const last = layout.dims.length > 1 && dim.display === layout.dims.length - 1;
  return dim.x + (last ? 0 : DIM_WIDTH);
}

function categoryLabel(
  layout: ParcatsLayout,
  calc: ParcatsCalc,
  flags: Set<string>,
  dim: DimBox,
  cat: CatBox,
): Label {
  const p = calc.total > 0 ? cat.count / calc.total : NaN;
  const lines: string[] = [];
  if (flags.has('count')) lines.push(`Count: ${cat.count}`);
  if (flags.has('probability')) lines.push(`P(${cat.label}): ${p3(p)}`);
  return {
    x: edgeX(layout, dim),
    y: cat.y + cat.height / 2,
    text: lines.join('<br>'),
    color: CATEGORY_COLOR,
    fields: { count: cat.count, probability: p, category: cat.label },
    inds: calc.dimensions[dim.dim]!.categories[cat.cat]!.valueInds,
  };
}

const sameColor = (a: number | undefined, b: number | undefined): boolean =>
  a === b || (a !== a && b !== b);

/** Hover labels of a hit, in container px. */
export function hoverLabels(
  layout: ParcatsLayout,
  calc: ParcatsCalc,
  trace: FullTrace,
  hit: ParcatsHit,
): Label[] {
  const flags = flagsOf(trace);
  const total = calc.total;
  if (hit.kind === 'path') {
    const path = hit.path;
    const k = hit.gap;
    const probability = total > 0 ? path.count / total : NaN;
    const fields = { count: path.count, probability };
    const template = ((trace['line'] ?? {}) as Record<string, unknown>)['hovertemplate'];
    const lines: string[] = [];
    if (flags.has('count')) lines.push(`Count: ${path.count}`);
    if (flags.has('probability')) lines.push(`P: ${p3(probability)}`);
    return [
      {
        x: (layout.dims[k]!.x + DIM_WIDTH + layout.dims[k + 1]!.x) / 2,
        y: (path.ys[k]! + path.ys[k + 1]! + path.height) / 2,
        text:
          typeof template === 'string' && template !== ''
            ? splitExtra(formatTemplate(template, { values: fields, fullData: trace })).text
            : lines.join('<br>'),
        color: path.color,
        fields,
        inds: calc.paths[path.index]!.valueInds,
      },
    ];
  }
  const { dim, cat, band } = hit;
  const mode = trace['hoveron'];
  if (mode === 'dimension') return dim.cats.map((c) => categoryLabel(layout, calc, flags, dim, c));
  if (mode !== 'color' || !band) return [categoryLabel(layout, calc, flags, dim, cat)];
  let colorcount = 0;
  for (const p of calc.paths) if (sameColor(p.rawColor, band.rawColor)) colorcount += p.count;
  const b = band.count;
  const lines: string[] = [];
  if (flags.has('count')) lines.push(`Count: ${b}`);
  if (flags.has('probability')) {
    lines.push(
      `P(color ∩ ${cat.label}): ${p3(b / total)}`,
      `P(${cat.label} | color): ${p3(b / colorcount)}`,
      `P(color | ${cat.label}): ${p3(b / cat.count)}`,
    );
  }
  return [
    {
      x: edgeX(layout, dim),
      y: band.y + band.height / 2,
      text: lines.join('<br>'),
      color: band.color,
      fields: {
        count: b,
        probability: b / total,
        category: cat.label,
        categorycount: cat.count,
        colorcount,
        bandcolorcount: b,
      },
      inds: band.paths.flatMap((i) => calc.paths[i]!.valueInds),
    },
  ];
}

/** What a hit highlights: calc path indices, and the category outlined thicker (if any). */
export function highlightOf(
  calc: ParcatsCalc,
  trace: FullTrace,
  hit: ParcatsHit | undefined,
): { paths: Set<number>; cat?: CatBox } | undefined {
  if (!hit || trace['hoverinfo'] === 'skip') return undefined;
  if (hit.kind === 'path') return { paths: new Set([hit.path.index]) };
  const { dim, cat, band } = hit;
  const color = trace['hoveron'] === 'color' ? band : undefined;
  const paths = new Set<number>();
  calc.paths.forEach((p, i) => {
    if (p.categories[dim.dim] !== cat.cat) return;
    if (!color || sameColor(p.rawColor, color.rawColor)) paths.add(i);
  });
  return color ? { paths } : { paths, cat };
}

/** The parcats `hoverPoints`: what is under `query.cx` / `query.cy`. */
export function parcatsHoverPoints(
  calc: ParcatsCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (!ctx.domain || query.cx === undefined || query.cy === undefined) return [];
  if (trace['hoverinfo'] === 'skip') return [];
  const rect = traceRect({ domain: ctx.domain, viewport: { size: { width: 0, height: 0 } } });
  const layout = layoutFor(calc, trace, ctx.fullLayout, rect);
  const hit = hitTest(layout, query.cx, query.cy);
  if (!hit) return [];
  const height = query.py + query.cy;
  const labels = hoverLabels(layout, calc, trace, hit);
  const multi = labels.length > 1;
  return labels.map((l) => ({
    pointIndex: l.inds[0] ?? -1,
    pointIndices: l.inds,
    distance: 0,
    px: l.x,
    py: height - l.y,
    color: l.color,
    fields: l.fields,
    hoverText: l.text,
    showName: false,
    ...(multi ? { multi: true } : {}),
  }));
}
