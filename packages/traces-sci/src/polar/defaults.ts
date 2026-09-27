/**
 * Trace-defaults helpers shared by the polar traces (plan E11.4, E11.5): `r` / `theta` (plotly.js
 * `handleRThetaDefaults`), and a view of the defaults context through which scatter's and bar's
 * own defaults run on a polar trace's schema.
 */
import {
  commonTraceAttributes,
  getNodeAtPath,
  isArrayLike,
  type FullTrace,
  type ObjectNode,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { polarLength } from './coordinates.ts';

/**
 * Coerce `r`, `theta` (or `r0` + `dr`, `theta0` + `dtheta`), `thetaunit` and `subplot`; set
 * `_length`. Returns the point count, 0 when the trace has no data (it is then hidden).
 */
export function supplyRThetaDefaults(traceOut: FullTrace, ctx: TraceDefaultsContext): number {
  ctx.coerce('subplot');
  const r = ctx.coerce('r');
  const theta = ctx.coerce('theta');
  const len = polarLength(r, theta);
  if (len === 0) {
    traceOut.visible = false;
    return 0;
  }
  if (isArrayLike(r) && !isArrayLike(theta)) {
    ctx.coerce('theta0');
    ctx.coerce('dtheta');
  } else if (!isArrayLike(r)) {
    ctx.coerce('r0');
    ctx.coerce('dr');
  }
  traceOut['_length'] = len;
  ctx.coerce('thetaunit');
  return len;
}

/**
 * `ctx` restricted to the attributes `schema` declares (plus the common trace attributes): other
 * paths coerce to `undefined` (or `special`'s answer), so another trace type's defaults can run
 * on this trace without declaring what it doesn't have (`x` / `y`, `error_y`, `stackgroup`…).
 */
export function restrictedContext(
  ctx: TraceDefaultsContext,
  schema: ObjectNode,
  special: Readonly<Record<string, unknown>> = {},
): TraceDefaultsContext {
  const known = (path: string, kind: 'attr' | 'object'): boolean =>
    getNodeAtPath(schema, path)?.kind === kind ||
    getNodeAtPath({ kind: 'object', children: commonTraceAttributes }, path)?.kind === kind;
  return {
    get template() {
      return ctx.template;
    },
    get fullLayout() {
      return ctx.fullLayout;
    },
    get defaultColor() {
      return ctx.defaultColor;
    },
    get index() {
      return ctx.index;
    },
    coerce: <T>(path: string, dflt?: unknown): T => {
      if (Object.hasOwn(special, path)) return special[path] as T;
      return (known(path, 'attr') ? ctx.coerce(path, dflt) : undefined) as T;
    },
    coerceContainer: (path, overrides) => {
      if (known(path, 'object')) ctx.coerceContainer(path, overrides);
    },
  };
}
