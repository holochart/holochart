/**
 * The basemap of a `geo` subplot (ADR-024, backlog GEO2): land, coastlines, countries, borders,
 * lakes, rivers and subunits at `resolution: 110` or `50`, for one `scope`.
 *
 * The data is Natural Earth, built into the package by `tools/geo-data` and loaded as lazy
 * chunks, one base chunk and one extras chunk (lakes, rivers, subunits) per resolution: a map
 * makes no request outside the app's own bundle. With `url` (Plotly's `config.topojsonURL`) the
 * files are fetched from there instead, in Plotly's layout and under Plotly's names.
 *
 * A load always settles (it is timed), a failed one is not remembered, and losing the extras
 * costs their layers only: the chart draws without them and one warning says so.
 */
import type { Topology } from 'topojson-specification';
import type { BasemapLayers, GeoResolution, GeoScope } from '../geo/types.ts';
import { loadChunk } from './chunks.ts';
import {
  decodeBase,
  decodeExtras,
  decodePlotly,
  joinExtras,
  type ExtrasTopology,
} from './decode.ts';

export type { BasemapLayers, GeoResolution, GeoScope } from '../geo/types.ts';

/** Options of {@link loadBasemap} and {@link peekBasemap}. */
export interface BasemapOptions {
  /** Also load lakes, rivers and subunits (`showlakes`, `showrivers`, `showsubunits`). */
  extras?: boolean;
  /**
   * Plotly's `config.topojsonURL`: fetch `<url>/<scope>_<resolution>m.json` instead of using the
   * bundled data. Nothing is fetched when it is unset or empty.
   */
  url?: string;
  /** How long a chunk or a file may take before the load fails, in ms. Default 30 000. */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30_000;

/** Parsed topologies by chunk or file; a failed load is removed so the next call retries. */
const topologies = new Map<string, Promise<Topology>>();
/** Decoded layers by request. Only complete results are kept. */
const decoded = new Map<string, BasemapLayers>();
/** Loads under way by request, so calls made in the same frame share one. */
const loading = new Map<string, Promise<BasemapLayers>>();
/** Resolutions whose missing extras have been reported. */
const warned = new Set<GeoResolution>();

function requestKey(resolution: GeoResolution, scope: GeoScope, options: BasemapOptions): string {
  return `${resolution}|${scope}|${options.extras ? 1 : 0}|${options.url || ''}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `promise`, rejected after `ms` if it has not settled by then. */
function timed<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** One topology, loaded once: `load` runs again only after it failed. */
function topologyOf(key: string, load: () => Promise<Topology>): Promise<Topology> {
  let topology = topologies.get(key);
  if (!topology) {
    topology = load();
    topologies.set(key, topology);
    topology.catch(() => {
      if (topologies.get(key) === topology) topologies.delete(key);
    });
  }
  return topology;
}

function isTopology(value: unknown): value is Topology {
  const topology = value as Partial<Topology> | null;
  return (
    typeof topology === 'object' &&
    topology !== null &&
    topology.type === 'Topology' &&
    typeof topology.objects === 'object' &&
    Array.isArray(topology.arcs)
  );
}

/** The base topology of a resolution, from its chunk. */
function baseTopology(resolution: GeoResolution, timeout: number): Promise<Topology> {
  return topologyOf(`base|${resolution}`, () =>
    timed(loadChunk('base', resolution), timeout, 'the chunk').then(
      (text) => JSON.parse(text) as Topology,
    ),
  );
}

/** The extras topology of a resolution, from its chunk, over the base's arcs. */
function extrasTopology(
  resolution: GeoResolution,
  base: Topology,
  timeout: number,
): Promise<Topology> {
  return topologyOf(`extras|${resolution}`, () =>
    timed(loadChunk('extras', resolution), timeout, 'the chunk').then((text) =>
      joinExtras(base, JSON.parse(text) as ExtrasTopology),
    ),
  );
}

/**
 * The file name Plotly gives a scope and a resolution, without `.json`: `world_110m`,
 * `north-america_50m` (plotly.js `getTopojsonName`).
 */
export function basemapFileName(scope: GeoScope, resolution: GeoResolution): string {
  return `${scope.replace(/ /g, '-')}_${resolution}m`;
}

/** The URL of a basemap file under `url` (plotly.js `getTopojsonPath`). */
export function basemapFileUrl(url: string, scope: GeoScope, resolution: GeoResolution): string {
  return `${url}${url.endsWith('/') ? '' : '/'}${basemapFileName(scope, resolution)}.json`;
}

/** A topology fetched from `file`; the request is aborted when it takes longer than `timeout`. */
async function fetchTopology(file: string, timeout: number): Promise<Topology> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(file, { signal: controller.signal });
    if (!response.ok) throw new Error(`${file} answered ${response.status}`);
    const topology: unknown = await response.json();
    if (!isTopology(topology)) throw new Error(`${file} is not a TopoJSON topology`);
    return topology;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${file} took longer than ${timeout} ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Layers and whether they are everything that was asked for (only then are they cached). */
interface Loaded {
  layers: BasemapLayers;
  complete: boolean;
}

async function loadBundled(
  resolution: GeoResolution,
  scope: GeoScope,
  extras: boolean,
  timeout: number,
): Promise<Loaded> {
  let base: Topology;
  try {
    base = await baseTopology(resolution, timeout);
  } catch (error) {
    throw new Error(
      `holochart: the 1:${resolution}m basemap could not be loaded: ${messageOf(error)}`,
      { cause: error },
    );
  }
  const layers = decodeBase(base, scope);
  if (!extras) return { layers, complete: true };
  try {
    const joined = await extrasTopology(resolution, base, timeout);
    return { layers: { ...layers, ...decodeExtras(base, joined, scope) }, complete: true };
  } catch (error) {
    if (!warned.has(resolution)) {
      warned.add(resolution);
      console.warn(
        `holochart: the lakes, rivers and subunits of the 1:${resolution}m basemap could not be ` +
          'loaded; the map is drawn without them.',
        error,
      );
    }
    return { layers, complete: false };
  }
}

async function loadRemote(
  resolution: GeoResolution,
  scope: GeoScope,
  extras: boolean,
  url: string,
  timeout: number,
): Promise<Loaded> {
  const file = basemapFileUrl(url, scope, resolution);
  try {
    const topology = await topologyOf(`url|${file}`, () => fetchTopology(file, timeout));
    return { layers: decodePlotly(topology, extras), complete: true };
  } catch (error) {
    throw new Error(
      `holochart: the 1:${resolution}m basemap could not be loaded: ${messageOf(error)}`,
      { cause: error },
    );
  }
}

/**
 * The basemap layers of one resolution and scope, decoded to GeoJSON.
 *
 * - Resolves with the same object for the same request once it has loaded.
 * - Rejects, with an `Error` that names the resolution, when the base data cannot be loaded. The
 *   failure is not remembered: the next call tries again.
 * - With `extras`, resolves with the base layers alone when only the extras cannot be loaded, and
 *   warns once per resolution. That result is not remembered either.
 * - With `url`, the one file Plotly's layout has per scope is fetched; `extras` then only says
 *   which of its layers to decode.
 */
export function loadBasemap(
  resolution: GeoResolution,
  scope: GeoScope,
  options: BasemapOptions = {},
): Promise<BasemapLayers> {
  const key = requestKey(resolution, scope, options);
  const ready = decoded.get(key);
  if (ready) return Promise.resolve(ready);
  let load = loading.get(key);
  if (!load) {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const extras = options.extras === true;
    // An empty URL is no URL: the bundled data, not a request to the page's own root.
    const started = options.url
      ? loadRemote(resolution, scope, extras, options.url, timeout)
      : loadBundled(resolution, scope, extras, timeout);
    load = started
      .then(({ layers, complete }) => {
        if (complete) decoded.set(key, layers);
        return layers;
      })
      .finally(() => {
        loading.delete(key);
      });
    loading.set(key, load);
  }
  return load;
}

/**
 * The layers {@link loadBasemap} resolved with for this request, or `undefined` while they are
 * not loaded (or were loaded without their extras). For a redraw, which cannot wait.
 */
export function peekBasemap(
  resolution: GeoResolution,
  scope: GeoScope,
  options: BasemapOptions = {},
): BasemapLayers | undefined {
  return decoded.get(requestKey(resolution, scope, options));
}

/**
 * Forgets every loaded topology and decoded layer, and that a warning was given. The data chunks
 * themselves stay in the module cache of the page.
 */
export function clearBasemapCache(): void {
  topologies.clear();
  decoded.clear();
  loading.clear();
  warned.clear();
}
