/**
 * Image hover (plan E11.3, E6.1), following plotly.js `image/hover.js`: the pixel under the
 * pointer, labelled `x: …`, `y: …` (its center), `z: [c0, c1, c2]` (the pixel's components as
 * given; for a `source`, its decoded 8-bit RGBA) and, with the `color` hover flag or a
 * `hovertemplate`, the color they make in the model (`RGB: [r, g, b]`, `HSLA: [h°, s%, l%, a]`).
 * `hovertemplate` gets `%{z}`, `%{color}`, `%{colormodel}` and their components (`%{z[0]}`,
 * `%{color[0]}`). A `source` has no pixel values until it is decoded.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { axisHoverText, dataValue } from '@mk7s/holochart-traces-stats';
import { colorRangeOf, pixelAt, type ImageCalc } from './calc.ts';
import { COLORMODELS, colorLabels, makeScaler, scaledToRgba8 } from './colormodel.ts';
import { decodedPixels } from './source.ts';

/**
 * The pixel column and row under linear coordinates `(xl, yl)`, or undefined off the image. Pixels
 * are found where they are drawn: evenly between the linear coordinates of the outer edges (the
 * same as Plotly's `(x − x0) / dx` except on log axes).
 */
export function imagePixelAt(
  calc: ImageCalc,
  xl: number,
  yl: number,
): { i: number; j: number } | undefined {
  if (calc.w === 0 || calc.h === 0) return undefined;
  const [x0, x1] = calc.xEdges;
  const [y0, y1] = calc.yEdges;
  const i = Math.floor(((xl - x0) / (x1 - x0)) * calc.w);
  const j = Math.floor(((yl - y0) / (y1 - y0)) * calc.h);
  if (!(i >= 0 && i < calc.w && j >= 0 && j < calc.h)) return undefined;
  return { i, j };
}

/** Linear coordinates of the center of pixel `(i, j)`. */
export function imagePixelCenter(calc: ImageCalc, i: number, j: number): [number, number] {
  const [x0, x1] = calc.xEdges;
  const [y0, y1] = calc.yEdges;
  return [x0 + ((i + 0.5) * (x1 - x0)) / calc.w, y0 + ((j + 0.5) * (y1 - y0)) / calc.h];
}

/** The pixel's components: `z[row][column]`, or the decoded source's RGBA. */
export function imagePixel(
  calc: ImageCalc,
  trace: FullTrace,
  i: number,
  j: number,
): ArrayLike<unknown> | undefined {
  if (calc.source === undefined) return pixelAt(trace['z'], j, i);
  const pixels = decodedPixels(calc.source);
  if (!pixels || i >= pixels.width || j >= pixels.height) return undefined;
  const k = (j * pixels.width + i) * 4;
  return Array.from({ length: 4 }, (_, c) => pixels.data[k + c]!);
}

function hoverFlags(trace: FullTrace): Set<string> {
  const v = trace['hoverinfo'];
  const s = typeof v === 'string' && v !== '' ? v : 'x+y+z+text+name';
  if (s === 'all') return new Set(['x', 'y', 'z', 'color', 'text', 'name']);
  return new Set(s.split('+'));
}

function cellText(v: unknown, j: number, i: number): unknown {
  if (!Array.isArray(v)) return undefined;
  const row = (v as unknown[])[j];
  return Array.isArray(row) ? (row as unknown[])[i] : undefined;
}

/** Hover points of an image: the pixel under the pointer, if it has a value. */
export function imageHoverPoints(
  calc: ImageCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const at = imagePixelAt(calc, query.xl, query.yl);
  if (!at) return [];
  const { i, j } = at;
  const pixel = imagePixel(calc, trace, i, j);
  if (!pixel) return [];
  // A source is read as `rgba256` at its full range (set by supply-defaults).
  const { colormodel, zmin, zmax } = colorRangeOf(trace);
  const spec = COLORMODELS[colormodel];
  const components = Array.from(pixel).slice(0, spec.channels);
  const scaled = makeScaler(colormodel, zmin, zmax)(components);
  const zLabel = `[${components.join(', ')}]`;
  const flags = hoverFlags(trace);
  const template = trace['hovertemplate'];
  const hasTemplate = typeof template === 'string' ? template !== '' : Array.isArray(template);
  const labels: Record<string, string> = { z: zLabel };
  let colorLine: string | undefined;
  if (scaled) {
    const { color, parts } = colorLabels(colormodel, scaled);
    labels['color'] = color;
    parts.forEach((p, k) => (labels[`color[${k}]`] = p));
    if (hasTemplate || flags.has('color')) colorLine = `${spec.css.toUpperCase()}: ${color}`;
  }
  const t = ctx.transform;
  const [xl, yl] = imagePixelCenter(calc, i, j);
  const xLabel = axisHoverText(ctx.xaxis, xl, undefined);
  const yLabel = axisHoverText(ctx.yaxis, yl, undefined);
  const hovertext = cellText(trace['hovertext'], j, i);
  const text = hovertext ?? cellText(trace['text'], j, i);
  const textLine = text === undefined || text === null ? '' : String(text);
  const lines: string[] = [];
  if (flags.has('x')) lines.push(`x: ${xLabel}`);
  if (flags.has('y')) lines.push(`y: ${yLabel}`);
  if (flags.has('z')) lines.push(`z: ${zLabel}`);
  if (flags.has('text') && textLine !== '') lines.push(textLine);
  if (colorLine) lines.push(colorLine);
  let color: string | undefined;
  if (scaled) {
    const rgba = new Uint8Array(4);
    scaledToRgba8(colormodel, scaled, rgba, 0);
    color = `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`;
  }
  return [
    {
      pointIndex: j * calc.w + i,
      cell: [j, i],
      distance: Number.isFinite(query.distance) ? query.distance : Number.MAX_VALUE,
      px: xl * t.scaleX + t.offsetX,
      py: yl * t.scaleY + t.offsetY,
      x: dataValue(ctx.xaxis, xl),
      y: dataValue(ctx.yaxis, yl),
      ...(textLine !== '' ? { text: textLine } : {}),
      ...(color ? { color } : {}),
      fields: {
        z: components,
        color: scaled ? scaled : undefined,
        colormodel,
      },
      labels: { x: xLabel, y: yLabel, ...labels },
      hoverText: lines.join('<br>'),
    },
  ];
}
