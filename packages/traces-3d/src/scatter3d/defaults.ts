/**
 * `scatter3d` supply-defaults (plan E14.2), a port of plotly.js `scatter3d/defaults.js` with
 * scatter's marker, line and text defaults (`handleMarkerDefaults` without selection and angle,
 * `handleLineDefaults`, `handleTextDefaults`) and the 3D error bars (`errorbars/defaults.js` with
 * `axis: 'z'`, then `x` and `y` inheriting from `z`). Attributes of modes that are off are not
 * coerced, so they don't show in `fullData` (Plotly semantics).
 */
import {
  isArrayLike,
  toRGBA,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { hasColorscale, supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';

type Container = Readonly<Record<string, unknown>>;

function hasFlag(mode: unknown, flag: string): boolean {
  return typeof mode === 'string' && mode.split('+').includes(flag);
}

/** Whether a defaulted `mode` draws markers / lines / text. */
export const hasMarkers3d = (mode: unknown): boolean => hasFlag(mode, 'markers');
export const hasLines3d = (mode: unknown): boolean => hasFlag(mode, 'lines');
export const hasText3d = (mode: unknown): boolean => hasFlag(mode, 'text');

function objectAt(v: unknown, key: string): Container | undefined {
  if (v === null || typeof v !== 'object') return undefined;
  const c = (v as Container)[key];
  return c !== null && typeof c === 'object' && !Array.isArray(c) ? (c as Container) : undefined;
}

/** Plotly's `fast-isnumeric`. */
function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
}

/** The point count: the shortest of `x`, `y`, `z` (all three are required, as in Plotly). */
function coerceCoordinates(ctx: TraceDefaultsContext): number {
  const x = ctx.coerce('x');
  const y = ctx.coerce('y');
  const z = ctx.coerce('z');
  if (!isArrayLike(x) || !isArrayLike(y) || !isArrayLike(z)) return 0;
  return Math.min(x.length, y.length, z.length);
}

function coerceMarker(traceIn: Container, ctx: TraceDefaultsContext): void {
  const markerIn = objectAt(traceIn, 'marker');
  const bubble = isArrayLike(markerIn?.['size']);
  // Plotly: a line color given as one color is the markers' default color too.
  const lineColorIn = objectAt(traceIn, 'line')?.['color'];
  const lineColor =
    typeof lineColorIn === 'string' && toRGBA(lineColorIn) ? lineColorIn : undefined;
  ctx.coerce('marker.symbol');
  ctx.coerce('marker.opacity', bubble ? 0.7 : 1);
  ctx.coerce('marker.size');
  const color = ctx.coerce('marker.color', lineColor ?? ctx.defaultColor);
  if (hasColorscale(markerIn)) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  // A line of another color outlines the markers (Plotly).
  let mlc = '#444';
  if (lineColor && String(toRGBA(String(color))) !== String(toRGBA(lineColor))) mlc = lineColor;
  else if (bubble) mlc = '#fff';
  ctx.coerce('marker.line.color', mlc);
  const lineIn = objectAt(markerIn, 'line');
  if (hasColorscale(lineIn)) {
    supplyColorscaleDefaults(lineIn, ctx.coerce, 'marker.line.', {
      inTrace: true,
      showscale: false,
    });
  }
  ctx.coerce('marker.line.width', bubble ? 1 : 0);
  if (bubble) {
    ctx.coerce('marker.sizeref');
    ctx.coerce('marker.sizemin');
    ctx.coerce('marker.sizemode');
  }
  ctx.coerce('marker.render');
}

function coerceLine(traceIn: Container, ctx: TraceDefaultsContext): void {
  const markerColor = objectAt(traceIn, 'marker')?.['color'];
  const lineIn = objectAt(traceIn, 'line');
  // A single marker color is the line's default color; per-point colors are not.
  ctx.coerce('line.color', typeof markerColor === 'string' ? markerColor : ctx.defaultColor);
  if (hasColorscale(lineIn)) {
    supplyColorscaleDefaults(lineIn, ctx.coerce, 'line.', { inTrace: true, showscale: true });
  }
  ctx.coerce('line.width');
  const render = ctx.coerce<string>('line.render');
  if (render === 'screen') ctx.coerce('line.dash');
  else {
    if (render === 'tube') ctx.coerce('line.radius');
    else {
      ctx.coerce('line.ribbon.axis');
      ctx.coerce('line.ribbon.width');
    }
    ctx.coerceContainer('line.lighting');
    ctx.coerceContainer('line.lightposition');
    if (ctx.coerce<string>('line.material.type') !== undefined)
      ctx.coerceContainer('line.material');
  }
}

function coerceText(ctx: TraceDefaultsContext): void {
  ctx.coerce('texttemplate');
  ctx.coerce('textposition');
  const font = (ctx.fullLayout['font'] ?? {}) as Record<string, unknown>;
  ctx.coerce('textfont.family', font['family']);
  ctx.coerce('textfont.size', font['size']);
  ctx.coerce('textfont.color', font['color']);
  ctx.coerce('textfont.weight', font['weight']);
  ctx.coerce('textfont.style', font['style']);
}

/**
 * `error_<letter>` defaults (Plotly's `errorbars/defaults.js`): visible when `array` or `value` is
 * given or `type` is `sqrt`; `type` and `symmetric` from what is given; `x` and `y` copy the `z`
 * style unless they style themselves. 3D bars have no caps, so `width` is not coerced.
 */
export function supplyErrorBar3dDefaults(
  traceIn: Container,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  letter: 'x' | 'y' | 'z',
  defaultColor: string,
): void {
  const name = `error_${letter}`;
  const input = objectAt(traceIn, name) ?? {};
  const coerce = <T = unknown>(key: string, dflt?: unknown): T =>
    ctx.coerce<T>(`${name}.${key}`, dflt);
  const given =
    input['array'] !== undefined || input['value'] !== undefined || input['type'] === 'sqrt';
  if (coerce<boolean>('visible', given) === false) return;
  const type = coerce<string>('type', 'array' in input ? 'data' : 'percent');
  let symmetric = true;
  if (type !== 'sqrt') {
    symmetric = coerce<boolean>(
      'symmetric',
      !((type === 'data' ? 'arrayminus' : 'valueminus') in input),
    );
  }
  if (type === 'data') {
    coerce('array');
    coerce('traceref');
    if (!symmetric) {
      coerce('arrayminus');
      coerce('tracerefminus');
    }
  } else if (type === 'percent' || type === 'constant') {
    coerce('value');
    if (!symmetric) coerce('valueminus');
  }
  let copy = false;
  if (letter !== 'z' && objectAt(traceOut, 'error_z')?.['visible'] === true) {
    copy = coerce<boolean>(
      'copy_zstyle',
      !(input['color'] || isNumeric(input['thickness']) || isNumeric(input['width'])),
    );
  }
  if (!copy) {
    coerce('color', defaultColor);
    coerce('thickness');
  }
}

/** Supply `scatter3d` defaults; sets `_length` (the point count) for calc. */
export function supplyScatter3dDefaults(
  traceIn: Container,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const length = coerceCoordinates(ctx);
  if (length === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;
  ctx.coerce('scene');
  ctx.coerce('text');
  ctx.coerce('hovertext');
  ctx.coerce('hovertemplate');
  ctx.coerce('xhoverformat');
  ctx.coerce('yhoverformat');
  ctx.coerce('zhoverformat');
  const mode = ctx.coerce('mode');
  if (hasMarkers3d(mode)) coerceMarker(traceIn, ctx);
  if (hasLines3d(mode)) {
    ctx.coerce('connectgaps');
    coerceLine(traceIn, ctx);
  }
  if (hasText3d(mode)) coerceText(ctx);
  const lineColor = objectAt(traceOut, 'line')?.['color'];
  const markerColor = objectAt(traceOut, 'marker')?.['color'];
  const single = (c: unknown): string | undefined =>
    typeof c === 'string' && c !== '' ? c : undefined;
  if (ctx.coerce<number>('surfaceaxis') >= 0) {
    ctx.coerce('surfacecolor', single(lineColor) ?? single(markerColor) ?? ctx.defaultColor);
  }
  for (const letter of ['x', 'y', 'z'] as const) {
    if (ctx.coerce(`projection.${letter}.show`) === true) {
      ctx.coerce(`projection.${letter}.opacity`);
      ctx.coerce(`projection.${letter}.scale`);
    }
  }
  const errorColor = single(lineColor) ?? single(markerColor) ?? ctx.defaultColor;
  supplyErrorBar3dDefaults(traceIn, traceOut, ctx, 'z', errorColor);
  supplyErrorBar3dDefaults(traceIn, traceOut, ctx, 'y', errorColor);
  supplyErrorBar3dDefaults(traceIn, traceOut, ctx, 'x', errorColor);
}
