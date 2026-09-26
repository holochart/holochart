/**
 * Helpers shared by the Express functions: orientation inference, marginal trace specs and the
 * trace attributes px always writes.
 */
import type { Args } from '../core/args.ts';
import type { Role, TraceSpec } from '../core/config.ts';
import type { MarginalKind } from '../options.ts';

/** Whether `color` is numeric, so it maps to a colorscale (px's `color_is_continuous`). */
export function continuousColor(args: Args): boolean {
  return args.cols.color !== undefined && args.table.type(args.cols.color) === 'numeric';
}

/**
 * px's orientation rule: an explicit `orientation` wins; with only one of x / y, horizontal when
 * that is y for histograms and scatters (`'value'`), or x for bars, boxes and violins
 * (`'category'`); with both, horizontal when x is numeric and y is not; else vertical.
 */
export function inferOrientation(args: Args, family: 'value' | 'category'): 'v' | 'h' {
  const given = args.options['orientation'];
  if (given === 'v' || given === 'h') return given;
  const { x, y } = args.cols;
  if (family === 'value' && y !== undefined && x === undefined) return 'h';
  if (family === 'category' && x !== undefined && y === undefined) return 'h';
  if (x !== undefined && y !== undefined) {
    const xNum = args.table.type(x) === 'numeric';
    const yNum = args.table.type(y) === 'numeric';
    if (xNum && !yNum) return 'h';
  }
  return 'v';
}

/** The data roles every trace takes after its own: ids, custom and hover data, continuous color. */
export function tailRoles(args: Args, withColor = true): Role[] {
  const roles: Role[] = ['animationGroup', 'customData', 'hoverData'];
  if (withColor && continuousColor(args)) roles.push('color');
  return roles;
}

/**
 * Marginal trace specs (px's `make_trace_spec`): a histogram (`opacity: 0.5`, one `bingroup`), a
 * notched box, a violin (`scalegroup`) or a rug (a box of `line-ns-open` / `line-ew-open` points with
 * no box) of x above the plot and of y right of it. `color` colors traces that have no color group.
 */
export function marginalSpecs(
  marginalX: MarginalKind | undefined,
  marginalY: MarginalKind | undefined,
  color?: string,
): TraceSpec[] {
  const out: TraceSpec[] = [];
  for (const [letter, kind] of [
    ['x', marginalX],
    ['y', marginalY],
  ] as const) {
    if (kind === undefined) continue;
    const marginal = letter;
    let spec: TraceSpec;
    switch (kind) {
      case 'histogram':
        spec = {
          type: 'histogram',
          attrs: [letter, letter === 'x' ? 'marginalX' : 'marginalY'],
          patch: { opacity: 0.5, bingroup: letter },
          marginal,
        };
        break;
      case 'violin':
        spec = {
          type: 'violin',
          attrs: [letter, 'hoverName', 'hoverData'],
          patch: { scalegroup: letter },
          marginal,
        };
        break;
      case 'box':
        spec = {
          type: 'box',
          attrs: [letter, 'hoverName', 'hoverData'],
          patch: { notched: true },
          marginal,
        };
        break;
      case 'rug':
        spec = {
          type: 'box',
          attrs: [letter, 'hoverName', 'hoverData'],
          patch: {
            fillcolor: 'rgba(255,255,255,0)',
            line: { color: 'rgba(255,255,255,0)' },
            boxpoints: 'all',
            jitter: 0,
            hoveron: 'points',
            marker: { symbol: letter === 'x' ? 'line-ns-open' : 'line-ew-open' },
          },
          marginal,
        };
        break;
      default:
        throw new Error(
          `Express: marginal must be 'histogram', 'box', 'violin' or 'rug' (got '${String(kind)}').`,
        );
    }
    if (color !== undefined) {
      const patch = { ...spec.patch } as Record<string, unknown>;
      patch['marker'] = { ...(patch['marker'] as object | undefined), color };
      spec = { ...spec, patch };
    }
    out.push(spec);
  }
  return out;
}

/** `marker.opacity` when `opacity` is given. */
export function opacityPatch(args: Args): Record<string, unknown> {
  const opacity = args.options['opacity'];
  return typeof opacity === 'number' ? { marker: { opacity } } : {};
}

/** Drop `undefined` values (so specs only carry what px would write). */
export function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** px's box / violin / strip mode default: `overlay` when color is the category axis, else `group`. */
export function groupMode(args: Args, orientation: 'v' | 'h', given: unknown): string {
  if (typeof given === 'string') return given;
  const { color, x, y } = args.cols;
  if (color !== undefined) {
    if (y === color && orientation === 'h') return 'overlay';
    if (x === color && orientation === 'v') return 'overlay';
  }
  return 'group';
}
