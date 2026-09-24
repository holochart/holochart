/**
 * Types of raster export (plan E18.1). Kept apart from `image.ts`, which is loaded on demand, so
 * the chart can name them without pulling the export code into every bundle.
 */
import type { FigureInput } from '@mk7s/holochart-core';

/** Raster formats of {@link ToImageOptions.format}. */
export type ImageFormat = 'png' | 'jpeg' | 'webp';

/**
 * Options of `chart.toImage` / `toImage(el, …)` (Plotly's `toImage` options, plus `transparent`).
 */
export interface ToImageOptions {
  /** Image format. Default `'png'`. */
  readonly format?: ImageFormat;
  /**
   * Width of the exported figure in CSS px: the figure is laid out again at this size. Default
   * (also `null`): the chart's current width (`layout.width`, else 700 for a figure object).
   */
  readonly width?: number | null;
  /** Height in CSS px; see {@link width}. */
  readonly height?: number | null;
  /**
   * Pixels per CSS px: the image is `width·scale × height·scale` pixels. Default 1 (not the
   * screen's device pixel ratio, so exports are the same on every screen).
   */
  readonly scale?: number;
  /**
   * Drop the paper background (the default look's `#0a0a0f`), and the plot-area background
   * unless the figure sets `layout.plot_bgcolor` itself, for an image with an alpha channel.
   * Ignored for `jpeg`, which has none. Default `false`.
   */
  readonly transparent?: boolean;
  /** Resolve to the base64 data without the `data:image/…;base64,` prefix (Plotly). */
  readonly imageDataOnly?: boolean;
}

/** Options of `chart.downloadImage` / `downloadImage(el, …)`. */
export interface DownloadImageOptions extends ToImageOptions {
  /** File name without extension. Default `'newplot'` (Plotly's). */
  readonly filename?: string;
}

/** What the lazily loaded export code needs from a chart (internal). */
export interface ExportSource {
  /** The figure to draw (the chart's current input, with its interactive selection). */
  readonly figure: FigureInput;
  /** Default size (CSS px) when the options give none. */
  readonly width: number;
  readonly height: number;
  /** The document to create the offscreen host in. */
  readonly document: Document;
  /**
   * Create the offscreen chart in `host` at `pixelRatio`. It shares the source's registry and
   * renderer factory, keeps its drawing buffer, and has no interaction or a11y mirror.
   */
  create(host: HTMLElement, figure: FigureInput, pixelRatio: number): ExportChart;
}

/** The slice of `Chart` the export code uses. */
export interface ExportChart {
  readonly ready: Promise<unknown>;
  readonly three: {
    readonly root: {
      renderNow(): void;
      readonly canvas: HTMLCanvasElement;
      readonly renderer: {
        getContext?(): {
          readonly drawingBufferWidth: number;
          readonly drawingBufferHeight: number;
        };
      };
    };
  };
  destroy(): void;
}
