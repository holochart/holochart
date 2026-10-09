/**
 * Getting what `locations` are matched against in hand (backlog GEO3, GEO4): the basemap of the
 * subplot, a `geojson` given as a URL, and the country-name table. `locations.ts` does the
 * matching and is synchronous; this module is the part that waits.
 *
 * {@link locationData} is called by the geo layout pass (`cross-trace.ts`) for each subplot with
 * the requests of its traces. It answers with what is there now and starts loading what is not.
 * When a load settles, the chart's layout pass runs again (`chart.resize()`, as when the code of
 * a projection arrives), and that pass finds the data.
 *
 * ## Readiness
 *
 * While something is loading, the subplot carries a promise (`GeoSubplot.loading`) that settles
 * when the loads have settled and the new pass has been asked for. A trace view keeps a hidden
 * primitive whose `ready` is that promise ({@link LoadingHold}): chart readiness waits for the
 * `ready` of primitives and then for the pass that was asked for, so `chart.ready`, update promises
 * and image export resolve once the trace is drawn, or once it is known that it cannot be.
 *
 * ## Failures
 *
 * Every load is timed and none is retried by the same chart: a basemap, a file or the table that
 * could not be loaded is reported once, the traces that needed it draw nothing, and the chart is
 * ready. A new chart tries again.
 */
import type { Primitive } from '@mk7s/holochart-render';
import type { Chart } from '@mk7s/holochart-runtime';
import { Object3D } from 'three';
import { loadBasemap, peekBasemap, type BasemapOptions } from '../basemap/index.ts';
import { needsBasemapExtras } from './base-layers.ts';
import { locate, type LocationsRequest, type LocationsResult } from './locations.ts';
import type { BasemapLayers, FullGeoLayout } from './types.ts';

/** How long a `geojson` file or the country-name chunk may take, in ms. */
export const LOCATION_DATA_TIMEOUT = 30_000;

/** What a subplot's traces can be located with in this pass (see {@link locationData}). */
export interface SubplotLocationData {
  /**
   * The basemap of the subplot's `resolution` and `scope`, when a request is matched against it
   * and it is loaded; with the extras when a request has `'USA-states'`.
   */
  readonly layers: BasemapLayers | undefined;
  /**
   * Settles (it never rejects) when everything the requests still wait for has arrived or failed
   * and the layout pass has been asked to run again. `undefined` when nothing is loading.
   */
  readonly loading: Promise<void> | undefined;
  /** The `geojson` of a request as an object, when it is one or its URL has been fetched. */
  geojson(request: LocationsRequest): object | undefined;
  /**
   * `locate` of `locations.ts` with what is in hand: `undefined` while the request's data is
   * loading, and for good when it could not be loaded.
   */
  locate(request: LocationsRequest): LocationsResult | undefined;
}

/** What one chart has asked for. */
interface ChartState {
  /** What a basemap request gave (it may lack the extras), or `null` when it failed. */
  readonly basemaps: Map<string, BasemapLayers | null>;
  /** Loads that failed and are not started again, by key. */
  readonly failed: Set<string>;
  /** Loads under way, by key: each settles after it asked for the new pass. */
  readonly loads: Map<string, Promise<void>>;
  /** Missing state layers that were reported, by basemap key. */
  readonly warned: Set<string>;
}

const newState = (): ChartState => ({
  basemaps: new Map(),
  failed: new Set(),
  loads: new Map(),
  warned: new Set(),
});

const STATES = new WeakMap<object, ChartState>();
/** For layout passes without a chart (hand-built contexts). */
let detached = newState();

/** GeoJSON objects fetched, by URL, for every chart of the page (Plotly's `PlotlyGeoAssets`). */
const GEOJSON = new Map<string, object>();
/** Fetches under way, shared by the charts that ask for the same URL. */
const FETCHES = new Map<string, Promise<object>>();
/** `countryNameToIso3` once its chunk has loaded. */
let countryNames: ((name: string) => string | undefined) | undefined;
let countryNamesLoad: Promise<void> | undefined;

function stateOf(chart: Chart | undefined): ChartState {
  if (!chart) return detached;
  let state = STATES.get(chart);
  if (!state) STATES.set(chart, (state = newState()));
  return state;
}

/** `start()`, rejected after `ms` if it has not settled; `cancel` then runs. */
function timed<T>(
  start: () => Promise<T>,
  ms: number,
  what: string,
  cancel?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cancel?.();
      reject(new Error(`${what} took longer than ${ms} ms`));
    }, ms);
    const settle = (): void => clearTimeout(timer);
    let promise: Promise<T>;
    try {
      promise = start();
    } catch (error) {
      settle();
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    promise.then(
      (value) => {
        settle();
        resolve(value);
      },
      (error: unknown) => {
        settle();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * The GeoJSON object at `url`. The request is aborted and the promise rejects when it takes longer
 * than `timeout` ms; it also rejects for an answer that is not OK or not a JSON object. A file is
 * fetched once per page; a failed fetch is not remembered.
 */
export function fetchGeojson(url: string, timeout = LOCATION_DATA_TIMEOUT): Promise<object> {
  const have = GEOJSON.get(url);
  if (have) return Promise.resolve(have);
  let fetching = FETCHES.get(url);
  if (!fetching) {
    const controller = new AbortController();
    fetching = timed(
      async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        const geojson: unknown = await response.json();
        if (typeof geojson !== 'object' || geojson === null || Array.isArray(geojson)) {
          throw new Error(`${url} is not a GeoJSON object`);
        }
        return geojson;
      },
      timeout,
      url,
      () => controller.abort(),
    )
      .then((geojson) => {
        GEOJSON.set(url, geojson);
        return geojson;
      })
      .finally(() => {
        FETCHES.delete(url);
      });
    FETCHES.set(url, fetching);
  }
  return fetching;
}

/** Loads the country-name chunk once for the page; a failed load is not remembered. */
function loadCountryNames(): Promise<void> {
  countryNamesLoad ??= timed(
    () => import('./country-names.ts'),
    LOCATION_DATA_TIMEOUT,
    'the country-name table',
  ).then(
    (module) => {
      countryNames = module.countryNameToIso3;
    },
    (error: unknown) => {
      countryNamesLoad = undefined;
      throw error;
    },
  );
  return countryNamesLoad;
}

/** Runs the chart's layout pass again. A chart destroyed meanwhile has nothing to run. */
function rerun(chart: Chart | undefined): void {
  try {
    // Hand-built charts may answer nothing.
    const pass = chart?.resize() as Promise<unknown> | undefined;
    pass?.catch?.(() => undefined);
  } catch {
    // Destroyed.
  }
}

/**
 * The load of `key` for this chart, started once: `load` runs, `failed` reports a rejection (the
 * key is then not loaded again), and the layout pass is asked for either way.
 */
function request(
  state: ChartState,
  key: string,
  chart: Chart | undefined,
  load: () => Promise<void>,
  failed: (error: unknown) => void,
): Promise<void> {
  let pending = state.loads.get(key);
  if (!pending) {
    pending = load()
      .catch((error: unknown) => {
        state.failed.add(key);
        failed(error);
      })
      .then(() => {
        state.loads.delete(key);
        rerun(chart);
      });
    state.loads.set(key, pending);
  }
  return pending;
}

/**
 * What the traces of one subplot can be located with now, and the loads still under way (see the
 * module comment). `requests` are the location requests of the subplot's traces; `chart` is the
 * chart whose layout pass runs again when a load settles, and whose `config.topojsonURL` says
 * where the basemap comes from (`chart.fullConfig`, set before the layout pass).
 */
export function locationData(
  requests: readonly LocationsRequest[],
  layout: FullGeoLayout,
  chart: Chart | undefined,
): SubplotLocationData {
  const state = stateOf(chart);
  const pending: Promise<void>[] = [];

  // The basemap, under the request the geo component makes for its layers when it can be the same.
  const url = chart?.fullConfig?.topojsonURL;
  const { resolution, scope } = layout;
  const states = requests.some((r) => r.locationmode === 'USA-states');
  const options: BasemapOptions = {
    extras: needsBasemapExtras(layout) || states,
    ...(typeof url === 'string' && url !== '' ? { url } : {}),
  };
  const basemapKey = `basemap|${resolution}|${scope}|${options.extras ? 1 : 0}|${options.url ?? ''}`;
  // Asked for only when a trace is matched against it: other subplots leave the loader alone.
  const matched = requests.some((r) => r.locationmode !== 'geojson-id');
  const layers = matched
    ? (peekBasemap(resolution, scope, options) ?? state.basemaps.get(basemapKey) ?? undefined)
    : undefined;
  if (matched && !layers && !state.failed.has(basemapKey)) {
    pending.push(
      request(
        state,
        basemapKey,
        chart,
        () =>
          loadBasemap(resolution, scope, options).then((loaded) => {
            // Without its extras a basemap is not in the loader's cache: keep what came.
            state.basemaps.set(basemapKey, loaded);
          }),
        (error) => {
          console.warn(
            `[holochart] the 1:${resolution}m basemap could not be loaded; traces given by ` +
              '`locations` are not drawn.',
            error,
          );
        },
      ),
    );
  }
  if (layers && states && !layers.subunits && !state.warned.has(basemapKey)) {
    state.warned.add(basemapKey);
    console.warn(
      `[holochart] the states of the 1:${resolution}m basemap could not be loaded; traces with ` +
        "locationmode 'USA-states' are not drawn.",
    );
  }

  // The country-name table.
  if (!countryNames && requests.some((r) => r.locationmode === 'country names')) {
    if (!state.failed.has('names')) {
      pending.push(
        request(state, 'names', chart, loadCountryNames, (error) => {
          console.warn(
            '[holochart] the country-name table could not be loaded; traces with locationmode ' +
              "'country names' are not drawn.",
            error,
          );
        }),
      );
    }
  }

  // GeoJSON given as a URL.
  for (const r of requests) {
    const file = r.locationmode === 'geojson-id' ? r.geojson : undefined;
    if (typeof file !== 'string' || file === '' || GEOJSON.has(file)) continue;
    const key = `geojson|${file}`;
    if (state.failed.has(key)) continue;
    const load = request(
      state,
      key,
      chart,
      () => fetchGeojson(file).then(() => undefined),
      (error) => {
        console.warn(
          `[holochart] the GeoJSON at ${JSON.stringify(file)} could not be loaded; the traces ` +
            'that use it are not drawn.',
          error,
        );
      },
    );
    if (!pending.includes(load)) pending.push(load);
  }

  const geojson = (r: LocationsRequest): object | undefined => {
    if (r.locationmode !== 'geojson-id') return undefined;
    if (typeof r.geojson === 'string') return GEOJSON.get(r.geojson);
    return typeof r.geojson === 'object' && r.geojson !== null ? r.geojson : undefined;
  };
  return {
    layers,
    loading:
      pending.length === 0
        ? undefined
        : pending.length === 1
          ? pending[0]
          : Promise.all(pending).then(() => undefined),
    geojson,
    locate: (r) => locate(r, { layers, geojson: geojson(r), countryNames }),
  };
}

/**
 * Forgets every fetched `geojson`, the loaded country-name lookup and what charts without a chart
 * object asked for (for tests).
 */
export function clearLocationData(): void {
  GEOJSON.clear();
  FETCHES.clear();
  countryNames = undefined;
  countryNamesLoad = undefined;
  detached = newState();
}

/**
 * A primitive that draws nothing and whose `ready` is a load: chart readiness waits for the
 * `ready` promises of primitives (the way the geo component's basemap is waited for).
 */
class PendingLocationData implements Primitive<never> {
  readonly object = new Object3D();
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
    this.object.visible = false;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {}
}

/** The part of a plot context a {@link LoadingHold} uses. */
interface PrimitiveHost {
  add<T>(primitive: Primitive<T>): Primitive<T>;
  remove<T>(primitive: Primitive<T>): void;
}

/**
 * Keeps `chart.ready` waiting while the data of a trace's locations loads (see the module
 * comment). A trace view owns one and calls {@link follow} on every draw with its subplot's
 * `loading` promise when the trace is given by locations, and with `undefined` otherwise.
 */
export class LoadingHold {
  #pending: PendingLocationData | undefined;

  follow(host: PrimitiveHost, loading: Promise<void> | undefined): void {
    if (this.#pending?.ready === loading) return;
    if (this.#pending) host.remove(this.#pending);
    this.#pending = loading ? new PendingLocationData(loading) : undefined;
    if (this.#pending) host.add(this.#pending);
  }
}
