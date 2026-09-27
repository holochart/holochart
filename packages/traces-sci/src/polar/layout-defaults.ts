/**
 * Supply-defaults of the polar subplots (plan E11.4), following plotly.js
 * `plots/polar/layout_defaults.js` (with `subplot_defaults.js`, `domain.js`, the cartesian tick,
 * line and grid default helpers it calls, and `barpolar/layout_defaults.js`).
 *
 * The subplots are the `subplot` ids of the polar traces (`'polar'`, `'polar2'`, …). Each gets its
 * `layout.polarN` container, defaulted from the user's container and the template's `polarN` (or
 * `polar`), with the axis types detected from the first visible trace on it and the category
 * lists of category axes collected from every trace on it (`_categories`).
 */
import {
  autoType,
  axisCategories,
  canonicalColor,
  getIn,
  getNodeAtPath,
  isArrayLike,
  isPlainObject,
  resolveWithTemplate,
  setIn,
  toRGBA,
  type AttrSpec,
  type CategoryOrder,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { polarAttributes } from './layout-attributes.ts';

/** `fullLayout` key of the polar subplot ids, in order of first use. */
export const POLAR_SUBPLOTS = '_polarSubplots';

/** The polar subplot ids of a defaulted layout. */
export function polarSubplotIds(fullLayout: FullLayout | undefined): readonly string[] {
  const ids = fullLayout?.[POLAR_SUBPLOTS];
  return Array.isArray(ids) ? (ids as string[]) : [];
}

/** Whether a (defaulted) trace is drawn on a polar subplot. */
export function isPolarTrace(trace: FullTrace): boolean {
  return trace._module?.categories.includes('polar') === true;
}

/** The subplot id of a polar trace. */
export function subplotOf(trace: Readonly<Record<string, unknown>>): string {
  const s = trace['subplot'];
  return typeof s === 'string' && s !== '' ? s : 'polar';
}

type Container = Record<string, unknown>;

/** Plotly's `Color.combine`: `front` composited over `back`, as a CSS color. */
function combine(front: string, back: string): string {
  const f = toRGBA(front);
  const b = toRGBA(back) ?? [1, 1, 1, 1];
  if (!f) return back;
  const a = f[3] + b[3] * (1 - f[3]);
  const ch = (i: 0 | 1 | 2): number =>
    Math.round(((f[i] * f[3] + b[i] * b[3] * (1 - f[3])) / (a || 1)) * 255);
  return canonicalColor(`rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`) ?? front;
}

/** Plotly's `Color.mix(a, b, 100 · t)`: `t = 0` gives `a`, `t = 1` gives `b`. */
function mix(a: string, b: string, t: number): string {
  const ca = toRGBA(a);
  const cb = toRGBA(b);
  if (!ca || !cb) return a;
  const ch = (i: 0 | 1 | 2): number => Math.round((ca[i] + (cb[i] - ca[i]) * t) * 255);
  return canonicalColor(`rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`) ?? a;
}

/** Plotly's `getAutorangeDflt`: `false` for a full range, `min`/`max` for a partial one. */
function autorangeDefault(range: unknown): unknown {
  if (!Array.isArray(range) || range.length !== 2) return true;
  const lo = range[0] === null || range[0] === undefined;
  const hi = range[1] === null || range[1] === undefined;
  if (lo && hi) return true;
  if (lo) return 'min';
  if (hi) return 'max';
  return false;
}

interface GridCells {
  rows: number;
  columns: number;
  _domains: { x: readonly [number, number][]; y: readonly [number, number][] };
}

function validExtent(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    v[0] < v[1]
  );
}

/**
 * Supply the polar subplots' defaults (the `supplyLayoutDefaults` of the polar trace modules;
 * idempotent, so each polar module may call it).
 */
export function supplyPolarLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const ids: string[] = [];
  for (const trace of ctx.fullData) {
    if (trace.visible === false || !isPolarTrace(trace)) continue;
    const id = subplotOf(trace);
    if (!ids.includes(id)) ids.push(id);
  }
  ids.sort((a, b) => (Number(a.slice(5)) || 1) - (Number(b.slice(5)) || 1));
  layoutOut[POLAR_SUBPLOTS] = ids;
  const tLayout = isPlainObject(ctx.template?.layout) ? ctx.template.layout : undefined;
  ids.forEach((id, i) => {
    const input = isPlainObject(layoutIn[id]) ? (layoutIn[id] as Container) : {};
    const template = tLayout?.[id] ?? tLayout?.['polar'];
    const out: Container = {};
    layoutOut[id] = out;
    const coerce = (path: string, ...dflt: [unknown?]): unknown => {
      const spec = getNodeAtPath(polarAttributes, path) as AttrSpec;
      const value = resolveWithTemplate(
        spec,
        getIn(input, path),
        getIn(template, path),
        dflt.length > 0 ? dflt[0] : spec.dflt,
      );
      if (value !== undefined) setIn(out, path, value);
      return value;
    };
    supplySubplot(id, i, ids.length, input, out, coerce, layoutOut, ctx.fullData);
  });
}

type Coerce = (path: string, ...dflt: [unknown?]) => unknown;

function supplySubplot(
  id: string,
  index: number,
  count: number,
  input: Container,
  out: Container,
  coerce: Coerce,
  layoutOut: FullLayout,
  fullData: readonly FullTrace[],
): void {
  coerce('uirevision', layoutOut['uirevision']);
  // Domain: a `layout.grid` cell, else side by side (plotly.js `handleSubplotDefaults`).
  let dfltX: [number, number] = [index / count, (index + 1) / count];
  let dfltY: [number, number] = [0, 1];
  const grid = layoutOut['grid'] as GridCells | undefined;
  if (grid?._domains && typeof grid.rows === 'number' && typeof grid.columns === 'number') {
    const column = coerce('domain.column') as number | undefined;
    if (column !== undefined) {
      const cell = column < grid.columns ? grid._domains.x[column] : undefined;
      if (cell) dfltX = [cell[0], cell[1]];
    }
    const row = coerce('domain.row') as number | undefined;
    if (row !== undefined) {
      const cell = row < grid.rows ? grid._domains.y[row] : undefined;
      if (cell) dfltY = [cell[0], cell[1]];
    }
  }
  if (!validExtent(coerce('domain.x', dfltX))) setIn(out, 'domain.x', dfltX);
  if (!validExtent(coerce('domain.y', dfltY))) setIn(out, 'domain.y', dfltY);

  const bgcolor = coerce('bgcolor') as string;
  const background = combine(bgcolor, String(layoutOut.paper_bgcolor));
  const sector = coerce('sector') as [number, number];
  coerce('hole');

  const traces = fullData.filter(
    (t) => t.visible !== false && isPolarTrace(t) && subplotOf(t) === id,
  );
  const font = layoutOut.font;
  for (const axName of ['angularaxis', 'radialaxis'] as const) {
    const axOut: Container = {};
    out[axName] = axOut;
    const c: Coerce = (path, ...dflt) => coerce(`${axName}.${path}`, ...dflt);
    const dataKey = axName === 'angularaxis' ? 'theta' : 'r';

    const autotypenumbers = c('autotypenumbers');
    let type = c('type') as string;
    if (type === '-') {
      const first = traces.find((t) => t.visible === true);
      const data = first?.[dataKey];
      type = isArrayLike(data)
        ? autoType(data, {
            noMultiCategory: true,
            ...(autotypenumbers === 'strict' ? { autotypenumbers: 'strict' as const } : {}),
          })
        : 'linear';
      if (type === 'multicategory') type = 'category';
      axOut['type'] = type;
    }
    if (axName === 'angularaxis' && type === 'date') {
      // Plotly: no date angular axes yet; the subplot's traces are hidden, the axis is linear.
      for (const t of traces) t.visible = false;
      type = 'linear';
      axOut['type'] = type;
    }
    if (axName === 'angularaxis' && type === 'log') {
      type = 'linear';
      axOut['type'] = type;
    }

    const categoryarray = c('categoryarray');
    const categoryorder = c(
      'categoryorder',
      isArrayLike(categoryarray) && categoryarray.length > 0 ? 'array' : 'trace',
    ) as CategoryOrder;
    if (type === 'category') {
      const cats = axisCategories(
        {
          type,
          categoryorder,
          ...(isArrayLike(categoryarray) ? { categoryarray } : {}),
        },
        traces.map((t) => t[dataKey]),
      );
      axOut['_categories'] = cats.categories ?? [];
    }

    const visible = c('visible') as boolean;
    c('uirevision', out['uirevision']);

    if (axName === 'radialaxis') {
      c('minallowed');
      c('maxallowed');
      const range = c('range') as unknown[] | undefined;
      let autorange = c('autorange', autorangeDefault(range));
      const partial = Array.isArray(range)
        ? [range[0] === null || range[0] === undefined, range[1] === null || range[1] === undefined]
        : [false, false];
      // Invalid partial ranges autorange fully (Plotly).
      if (
        Array.isArray(range) &&
        ((partial[0] && partial[1]) ||
          ((partial[0] || partial[1]) && (autorange === 'reversed' || autorange === true)) ||
          (!partial[0] && (autorange === 'min' || autorange === 'max reversed')) ||
          (!partial[1] && (autorange === 'max' || autorange === 'min reversed')))
      ) {
        delete axOut['range'];
        autorange = true;
        axOut['autorange'] = true;
      }
      if (autorange) {
        for (const k of ['minallowed', 'maxallowed', 'clipmin', 'clipmax', 'include']) {
          c(`autorangeoptions.${k}`);
        }
        if (type === 'linear') c('rangemode');
      }
    } else {
      if (type === 'linear') c('thetaunit');
      else c('period');
      const direction = c('direction') as string;
      c('rotation', direction === 'clockwise' ? 90 : 0);
    }

    // Prefix / suffix: `°` after the degrees of a linear angular axis.
    const degrees = axName === 'angularaxis' && axOut['thetaunit'] === 'degrees';
    c('showtickprefix');
    c('tickprefix');
    c('showticksuffix');
    c('ticksuffix', degrees ? '°' : '');

    if (visible) {
      const color = c('color') as string;
      const fontColor = color !== canonicalColor('#444') ? color : font.color;
      const tickvals = c('tickvals');
      const dtick = c('dtick');
      c(
        'tickmode',
        isArrayLike(tickvals)
          ? 'array'
          : dtick !== undefined && dtick !== null && dtick !== '' && dtick !== 0
            ? 'linear'
            : 'auto',
      );
      c('nticks');
      c('tick0');
      c('ticktext');
      c('showticklabels');
      for (const [k, v] of [
        ['family', font.family],
        ['size', font.size],
        ['color', fontColor],
        ['weight', font.weight],
        ['style', font.style],
        ['variant', font.variant],
        ['textcase', font.textcase],
        ['lineposition', font.lineposition],
        ['shadow', font.shadow],
      ] as const) {
        c(`tickfont.${k}`, v);
      }
      c('tickangle');
      if (axName === 'radialaxis') c('autotickangles');
      c('tickformat');
      c('tickformatstops');
      c('ticklabelstep');
      c('minorloglabels');
      c('showexponent');
      c('exponentformat');
      c('minexponent');
      c('separatethousands');
      // Plotly's `outerTicks`: polar axes draw outside ticks unless told otherwise.
      if (c('ticks', 'outside')) {
        c('ticklen');
        c('tickwidth');
        c('tickcolor', color);
      }
      if (c('showline')) {
        c('linecolor', color);
        c('linewidth');
      }
      if (c('showgrid')) {
        // Heavier than the cartesian default (60 % towards the background): the grid is not
        // square, so the eye needs stronger cues (Plotly).
        c('gridcolor', mix(color, background, 0.6));
        c('gridwidth');
        c('griddash');
      }
      c('layer');
      if (axName === 'radialaxis') {
        c('side');
        c('angle', sector[0]);
        c('title.text');
        for (const [k, v] of [
          ['family', font.family],
          ['size', Math.round(font.size * 1.2)],
          ['color', fontColor],
          ['weight', font.weight],
          ['style', font.style],
          ['variant', font.variant],
          ['textcase', font.textcase],
          ['lineposition', font.lineposition],
          ['shadow', font.shadow],
        ] as const) {
          c(`title.font.${k}`, v);
        }
      }
    }
    if (type !== 'category') c('hoverformat');
  }
  if ((out['angularaxis'] as Container)['type'] === 'category') coerce('gridshape');
  if (traces.some((t) => t.type === 'barpolar' && t.visible === true)) {
    coerce('barmode');
    coerce('bargap');
  }
}
