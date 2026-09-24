/**
 * Raster export (plan E18.1): `toImage` / `downloadImage`, loaded on demand (a dynamic `import()`
 * from the chart), so pages that never export don't download it.
 *
 * The image is not a screenshot of the live canvas. Like Plotly, the figure is drawn again by an
 * offscreen chart — a detached element with its own canvas — laid out at the requested width ×
 * height and rendered at `scale` pixels per CSS px. That chart is static (no hover labels,
 * selection outlines or modebar, which are DOM and never part of the WebGL frame), keeps its
 * drawing buffer, and is read back once `ready` says every text label, font and layout image is
 * in, and then destroyed. The live chart is not touched, so nothing flickers and hover, zoom and
 * pending updates carry on.
 */
import { isPlainObject, type FigureInput } from '@mk7s/holochart-core';
import type {
  DownloadImageOptions,
  ExportChart,
  ExportSource,
  ImageFormat,
  ToImageOptions,
} from './types.ts';

const MIME: Readonly<Record<ImageFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** A positive finite size, or `undefined`. */
function size(value: unknown, what: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new RangeError(`toImage: ${what} must be a number ≥ 1 (got ${String(value)})`);
  }
  return Math.round(value);
}

/** The figure the offscreen chart draws: requested size, optionally without backgrounds. */
function exportFigure(
  figure: FigureInput,
  width: number,
  height: number,
  transparent: boolean,
): FigureInput {
  const input = isPlainObject(figure.layout) ? figure.layout : {};
  const layout: Record<string, unknown> = { ...input, width, height };
  if (transparent) {
    layout['paper_bgcolor'] = 'rgba(0,0,0,0)';
    // The default look paints the plot area in the paper color; keep only a background the
    // figure asked for itself.
    if (input['plot_bgcolor'] === undefined) layout['plot_bgcolor'] = 'rgba(0,0,0,0)';
  }
  const config = isPlainObject(figure.config) ? figure.config : {};
  return {
    ...figure,
    layout,
    // Static: no hover layer, interaction or modebar; fixed size.
    config: { ...config, staticPlot: true, displayModeBar: false, responsive: false },
  };
}

/**
 * Render `source` offscreen and encode it (see the module comment). Resolves to a data URL, or
 * the bare base64 data with `imageDataOnly`.
 *
 * @throws (rejects) `RangeError` for invalid sizes or scale, or when the image is larger than
 * the GPU can draw; `Error` for an unknown format or one the browser cannot encode.
 */
export async function renderImage(source: ExportSource, options: ToImageOptions): Promise<string> {
  const format = options.format ?? 'png';
  const mime = MIME[format];
  if (!mime) throw new Error(`toImage: unsupported format '${String(format)}' (png, jpeg or webp)`);
  const width = size(options.width, 'width') ?? source.width;
  const height = size(options.height, 'height') ?? source.height;
  const scale = options.scale ?? 1;
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`toImage: scale must be a positive number (got ${String(scale)})`);
  }
  const transparent = options.transparent === true && format !== 'jpeg';
  const host = source.document.createElement('div');
  host.style.cssText = `width:${width}px;height:${height}px;`;
  let chart: ExportChart | undefined;
  try {
    chart = source.create(host, exportFigure(source.figure, width, height, transparent), scale);
    await chart.ready;
    const root = chart.three.root;
    // Draw now and read back in the same task (the buffer is also preserved).
    root.renderNow();
    const canvas = root.canvas;
    // Browsers silently shrink a drawing buffer larger than the GPU allows: fail instead of
    // returning a cropped image.
    const gl = root.renderer.getContext?.();
    if (gl && (gl.drawingBufferWidth < canvas.width || gl.drawingBufferHeight < canvas.height)) {
      throw new RangeError(
        `toImage: ${canvas.width}×${canvas.height} px is larger than this GPU can draw ` +
          `(${gl.drawingBufferWidth}×${gl.drawingBufferHeight}); lower width, height or scale`,
      );
    }
    const url = canvas.toDataURL(mime);
    if (!url.startsWith(`data:${mime}`)) {
      throw new Error(`toImage: this browser cannot encode ${format}`);
    }
    return options.imageDataOnly ? url.slice(url.indexOf(',') + 1) : url;
  } finally {
    chart?.destroy();
  }
}

/**
 * Export like {@link renderImage} and save the file through a temporary download link. Resolves
 * to the file name (`<filename>.<format>`), like Plotly's `downloadImage`.
 */
export async function downloadImage(
  source: ExportSource,
  options: DownloadImageOptions,
): Promise<string> {
  const format = options.format ?? 'png';
  const url = await renderImage(source, { ...options, format, imageDataOnly: false });
  const base =
    typeof options.filename === 'string' && options.filename !== '' ? options.filename : 'newplot';
  const name = `${base}.${format}`;
  const doc = source.document;
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  (doc.body ?? doc.documentElement).appendChild(link);
  link.click();
  link.remove();
  return name;
}
