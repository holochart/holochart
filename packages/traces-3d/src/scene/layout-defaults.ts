/**
 * Supply-defaults of the 3D scenes (plan E14.1a, E14.1b), following plotly.js
 * `plots/gl3d/layout/defaults.js` and `axis_defaults.js` (with `subplot_defaults.js`, `domain.js`
 * and the cartesian type, tick, line and grid default helpers they call).
 *
 * The scenes are the `scene` ids of the visible 3D traces (`'scene'`, `'scene2'`, …; traces in
 * the `gl3d` category). Each gets its `layout.sceneN` container, defaulted from the user's
 * container and the template's `sceneN` (or `scene`), with the axis types detected from the first
 * visible trace on it and the category lists of category axes collected from every trace on it
 * (`_categories`). The ids are listed in `fullLayout._sceneIds`.
 */
import {
  autoType,
  axisCategories,
  canonicalColor,
  coerceContainer,
  getIn,
  getNodeAtPath,
  isArrayLike,
  isPlainObject,
  resolveWithTemplate,
  scaledFontSize,
  setIn,
  toRGBA,
  type AttrSpec,
  type CategoryOrder,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { supplySceneAnnotations } from './annotations.ts';
import { supplySceneAutorotate } from './camera-animation.ts';
import { sceneAttributes, sceneAxisAttributes } from './layout-attributes.ts';
import { supplySceneLightingLayout } from './lighting-attributes.ts';

/** `fullLayout` key of the scene ids, in order of their number. */
export const SCENE_IDS = '_sceneIds';

/** The axis letters of a scene, in order. */
export const SCENE_LETTERS = ['x', 'y', 'z'] as const;
export type SceneLetter = (typeof SCENE_LETTERS)[number];

type Container = Record<string, unknown>;

/** The scene ids of a defaulted layout. @internal */
export function sceneIds(fullLayout: FullLayout | undefined): readonly string[] {
  const ids = fullLayout?.[SCENE_IDS];
  return Array.isArray(ids) ? (ids as string[]) : [];
}

/** Whether a (defaulted) trace is drawn in a 3D scene. @internal */
export function isSceneTrace(trace: FullTrace): boolean {
  return trace._module?.categories.includes('gl3d') === true;
}

/** The scene id of a 3D trace. @experimental */
export function sceneOf(trace: Readonly<Record<string, unknown>>): string {
  const s = trace['scene'];
  return typeof s === 'string' && s !== '' ? s : 'scene';
}

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

/** tinycolor's `mix(a, b, 100 · t)`: `t = 0` gives `a`, `t = 1` gives `b`. */
function mix(a: string, b: string, t: number): string {
  const ca = toRGBA(a);
  const cb = toRGBA(b);
  if (!ca || !cb) return a;
  const ch = (i: 0 | 1 | 2): number => Math.round((ca[i] + (cb[i] - ca[i]) * t) * 255);
  return canonicalColor(`rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`) ?? a;
}

/** Plotly's 3D grid lightness: the default grid is 72.7 % of the way from `color` to the background. */
const GRID_MIX = (204 - 0x44) / (255 - 0x44);

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

interface GridCells {
  rows: number;
  columns: number;
  _domains: { x: readonly [number, number][]; y: readonly [number, number][] };
}

/**
 * Supply the scenes' defaults (the scene component's `supplyLayoutDefaults`; idempotent, so 3D
 * trace modules may call it too).
 */
export function supplySceneLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const ids: string[] = [];
  let non3d = false;
  for (const trace of ctx.fullData) {
    if (trace.visible === false) continue;
    if (!isSceneTrace(trace)) {
      non3d = true;
      continue;
    }
    const id = sceneOf(trace);
    if (!ids.includes(id)) ids.push(id);
  }
  ids.sort((a, b) => (Number(a.slice(5)) || 1) - (Number(b.slice(5)) || 1));
  layoutOut[SCENE_IDS] = ids;
  if (ids.length === 0) return;
  const tLayout = isPlainObject(ctx.template?.layout) ? ctx.template.layout : undefined;
  // Layout-wide dragmode / hovermode apply to scenes when 3D is the only plot type (Plotly).
  const fromLayout = (key: string, allowed: readonly unknown[]): unknown =>
    !non3d && allowed.includes(layoutIn[key]) ? layoutIn[key] : undefined;
  const dragmode = fromLayout('dragmode', ['orbit', 'turntable', 'zoom', 'pan', false]);
  const hovermode = fromLayout('hovermode', ['closest', false]);
  ids.forEach((id, i) => {
    const input = isPlainObject(layoutIn[id]) ? (layoutIn[id] as Container) : {};
    const template = (tLayout?.[id] ?? tLayout?.['scene']) as Container | undefined;
    const out: Container = {};
    layoutOut[id] = out;
    const traces = ctx.fullData.filter(
      (t) => t.visible !== false && isSceneTrace(t) && sceneOf(t) === id,
    );
    supplyScene(id, i, ids.length, input, template, out, layoutOut, traces, dragmode, hovermode);
    supplySceneAnnotations(input, template, tLayout, out, layoutOut);
  });
}

function supplyScene(
  _id: string,
  index: number,
  count: number,
  input: Container,
  template: Container | undefined,
  out: Container,
  layoutOut: FullLayout,
  traces: readonly FullTrace[],
  layoutDragmode: unknown,
  layoutHovermode: unknown,
): void {
  const coerce = (path: string, dflt?: unknown): unknown => {
    const spec = getNodeAtPath(sceneAttributes, path) as AttrSpec;
    const value = resolveWithTemplate(
      spec,
      getIn(input, path),
      getIn(template, path),
      dflt === undefined ? spec.dflt : dflt,
    );
    if (value !== undefined) setIn(out, path, value);
    return value;
  };

  // Domain: a `layout.grid` cell, else side by side (plotly.js `handleSubplotDefaults`).
  let dfltX: [number, number] = [index / count, (index + 1) / count];
  let dfltY: [number, number] = [0, 1];
  const grid = layoutOut['grid'] as GridCells | undefined;
  if (grid?._domains && typeof grid.rows === 'number' && typeof grid.columns === 'number') {
    const column = coerce('domain.column') as number | undefined;
    const cx = column !== undefined && column < grid.columns ? grid._domains.x[column] : undefined;
    if (cx) dfltX = [cx[0], cx[1]];
    const row = coerce('domain.row') as number | undefined;
    const cy = row !== undefined && row < grid.rows ? grid._domains.y[row] : undefined;
    if (cy) dfltY = [cy[0], cy[1]];
  }
  if (!validExtent(coerce('domain.x', dfltX))) setIn(out, 'domain.x', dfltX);
  if (!validExtent(coerce('domain.y', dfltY))) setIn(out, 'domain.y', dfltY);

  coerceContainer(sceneAttributes, input, out, {
    template,
    only: new Set(['bgcolor', 'camera', 'aspectmode', 'aspectratio', 'uirevision']),
    overrides: { uirevision: layoutOut['uirevision'] },
  });
  // A ratio is given only when all three are positive; otherwise 1:1:1 and no `manual` mode.
  const ratio = out['aspectratio'] as Record<string, unknown>;
  const hasAspect = SCENE_LETTERS.every((k) => (ratio[k] as number) > 0);
  if (!hasAspect) {
    out['aspectratio'] = { x: 1, y: 1, z: 1 };
    const mode = resolveWithTemplate(
      getNodeAtPath(sceneAttributes, 'aspectmode') as AttrSpec,
      input['aspectmode'],
      template?.['aspectmode'],
      'auto',
    );
    out['aspectmode'] = mode === 'manual' ? 'auto' : mode;
  } else if (input['aspectmode'] === undefined && template?.['aspectmode'] === undefined) {
    out['aspectmode'] = 'manual';
  }

  const bg = combine(String(out['bgcolor']), String(layoutOut.paper_bgcolor));
  for (const letter of SCENE_LETTERS) {
    const name = `${letter}axis`;
    const axIn = isPlainObject(input[name]) ? (input[name] as Container) : {};
    const axT = isPlainObject(template?.[name]) ? (template[name] as Container) : undefined;
    out[name] = supplyAxis(letter, axIn, axT, layoutOut, bg, traces);
  }

  // Plotly: `orbit` unless the camera keeps z up (then `turntable`, also without a camera).
  let dragmode = layoutDragmode;
  if (dragmode === undefined) {
    const up = getIn(input, 'camera.up') as Container | undefined;
    dragmode = 'turntable';
    if (isPlainObject(up)) {
      const [x, y, z] = [Number(up['x']), Number(up['y']), Number(up['z'])];
      dragmode =
        z !== 0 && (!x || !y || !z || z / Math.hypot(x, y, z) > 0.999) ? 'turntable' : 'orbit';
    }
  }
  coerce('dragmode', dragmode);
  coerce('hovermode', layoutHovermode);
  // Holochart extensions (E8.7, E7.5): lights only when given; auto-rotation off unless given.
  supplySceneLightingLayout(input, template, out);
  supplySceneAutorotate(input, template, out);
}

function supplyAxis(
  letter: 'x' | 'y' | 'z',
  input: Container,
  template: Container | undefined,
  layoutOut: FullLayout,
  bg: string,
  traces: readonly FullTrace[],
): Container {
  const spec = (path: string): AttrSpec => getNodeAtPath(sceneAxisAttributes, path) as AttrSpec;
  const resolve = (path: string, dflt?: unknown): unknown =>
    resolveWithTemplate(
      spec(path),
      getIn(input, path),
      getIn(template, path),
      dflt ?? spec(path).dflt,
    );
  const font = layoutOut.font;
  const color = resolve('color') as string;
  const fontColor = color !== canonicalColor('#444') ? color : font.color;
  const tickvals = resolve('tickvals');
  const dtick = resolve('dtick');
  const categoryarray = resolve('categoryarray');
  const overrides: Record<string, unknown> = {
    autorange: autorangeDefault(resolve('range')),
    linecolor: color,
    tickcolor: color,
    zerolinecolor: color,
    spikecolor: color,
    gridcolor: mix(color, bg, GRID_MIX),
    tickmode: isArrayLike(tickvals)
      ? 'array'
      : dtick !== undefined && dtick !== null && dtick !== '' && dtick !== 0
        ? 'linear'
        : 'auto',
    categoryorder: isArrayLike(categoryarray) && categoryarray.length > 0 ? 'array' : 'trace',
    'title.text': letter,
  };
  for (const [prefix, scale] of [
    ['tickfont', 1],
    ['title.font', 1.2],
  ] as const) {
    overrides[`${prefix}.family`] = font.family;
    overrides[`${prefix}.size`] = scaledFontSize(font.size, scale);
    overrides[`${prefix}.color`] = fontColor;
    overrides[`${prefix}.weight`] = font.weight;
    overrides[`${prefix}.style`] = font.style;
    overrides[`${prefix}.variant`] = font.variant;
    overrides[`${prefix}.textcase`] = font.textcase;
    overrides[`${prefix}.lineposition`] = font.lineposition;
    overrides[`${prefix}.shadow`] = font.shadow;
  }
  const out = coerceContainer(sceneAxisAttributes, input, {}, { template, overrides });
  out['_name'] = `${letter}axis`;
  out['_id'] = letter;

  let type = out['type'] as string;
  if (type === '-') {
    const first = traces.find((t) => t.visible === true && isArrayLike(t[letter]));
    type = first
      ? autoType(first[letter], {
          noMultiCategory: true,
          ...(out['autotypenumbers'] === 'strict' ? { autotypenumbers: 'strict' as const } : {}),
        })
      : 'linear';
    if (type === 'multicategory') type = 'category';
    out['type'] = type;
  }
  if (type === 'category') {
    const cats = axisCategories(
      {
        type,
        categoryorder: out['categoryorder'] as CategoryOrder,
        ...(isArrayLike(out['categoryarray']) ? { categoryarray: out['categoryarray'] } : {}),
      },
      traces.map((t) => t[letter]),
    );
    out['_categories'] = cats.categories ?? [];
  }
  return out;
}
