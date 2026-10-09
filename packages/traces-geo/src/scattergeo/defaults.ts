/**
 * `scattergeo` supply-defaults (backlog GEO3), following plotly.js `scattergeo/defaults.js` (MIT):
 * `locations` (with `geojson`, `locationmode`, `featureidkey`) or else `lon` / `lat`, then
 * scatter's own mode, marker, line, text and fill defaults, run through a context restricted to
 * the scattergeo schema. As in Plotly, `locations` win over `lon` / `lat` when both are given, and
 * `mode` defaults to `'markers'` whatever the point count.
 */
import {
  commonTraceAttributes,
  getNodeAtPath,
  isArrayLike,
  isPlainObject,
  type FullTrace,
  type ObjectNode,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { scatter } from '@mk7s/holochart-traces-basic';
import { scattergeoAttributes } from './attributes.ts';

/**
 * `ctx` restricted to the attributes `schema` declares (plus the common trace attributes): other
 * paths coerce to `undefined` (or `special`'s answer), so scatter's defaults can run on this trace
 * without it declaring what it doesn't have (`x` / `y`, `error_y`, `stackgroup`, `line.shape`…).
 * The defaults that scatter passes are dropped for the paths in `ownDefaults`, whose schema
 * default stands (scatter derives `mode` from the point count; Plotly's scattergeo does not).
 */
function restrictedContext(
  ctx: TraceDefaultsContext,
  schema: ObjectNode,
  special: Readonly<Record<string, unknown>>,
  ownDefaults: ReadonlySet<string>,
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
      if (!known(path, 'attr')) return undefined as T;
      return ownDefaults.has(path) ? ctx.coerce(path) : ctx.coerce(path, dflt);
    },
    coerceContainer: (path, overrides) => {
      if (known(path, 'object')) ctx.coerceContainer(path, overrides);
    },
  };
}

const OWN_DEFAULTS: ReadonlySet<string> = new Set(['mode']);

function lengthOf(v: unknown): number {
  return isArrayLike(v) ? v.length : 0;
}

export function supplyScattergeoDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('geo');
  let len = lengthOf(ctx.coerce('locations'));
  if (len > 0) {
    const geojson = ctx.coerce('geojson');
    const custom = (typeof geojson === 'string' && geojson !== '') || isPlainObject(geojson);
    const locationmode = ctx.coerce('locationmode', custom ? 'geojson-id' : undefined);
    if (locationmode === 'geojson-id') ctx.coerce('featureidkey');
  } else {
    // An empty `locations` is no locations: it must not shadow `lon` / `lat` in calc.
    delete traceOut['locations'];
    len = Math.min(lengthOf(ctx.coerce('lon')), lengthOf(ctx.coerce('lat')));
  }
  if (len === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = len;
  // Scatter reads the point count from `x` / `y`: give it arrays of the geo length.
  const points = new Array<undefined>(len);
  scatter.supplyDefaults(
    traceIn,
    traceOut,
    restrictedContext(
      ctx,
      scattergeoAttributes,
      { x: points, y: points, 'error_x.visible': false, 'error_y.visible': false },
      OWN_DEFAULTS,
    ),
  );
  // Holochart's own, and so not among scatter's line defaults: the height of the arcs on a globe.
  if (
    String(traceOut['mode'] ?? '')
      .split('+')
      .includes('lines')
  )
    ctx.coerce('line.lift');
}
