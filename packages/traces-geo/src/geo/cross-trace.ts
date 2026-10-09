/**
 * The geo traces' shared `crossTraceLayout` (backlog GEO2): once per layout pass, with every
 * visible trace on a geo subplot, it builds each subplot's {@link GeoSubplot} — the projection
 * fitted to the subplot's domain, to the data when `fitbounds` is on — and hands it to every
 * member (`calc.subplot`) and to the geo component.
 *
 * A subplot's view is kept from one pass to the next: when the new layout projects like the old
 * one (the relayout that ends a pan or a zoom changes only the centre and the scale), the new view
 * keeps the old base, and nothing that was projected has to be projected again.
 *
 * Traces given by `locations` (backlog GEO3, GEO4) are located here, before the view is fitted:
 * a trace says what it needs in `calc.locations`, the pass matches the locations against what is
 * loaded (`location-data.ts`, `locations.ts`) and hands the answer to `calc.located`. What is not
 * loaded yet is requested, and the pass runs again when it arrives or fails.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import type { Chart, DomainLayoutContext, DomainTraceEntry } from '@mk7s/holochart-runtime';
import { geoSubplotRect } from './domain.ts';
import { geoLayoutOf, geoOf } from './layout-defaults.ts';
import { locationData, type SubplotLocationData } from './location-data.ts';
import { geojsonCoords, type LocationsRequest, type LocationsResult } from './locations.ts';
import { isProjectionReady, loadProjection } from './projections.ts';
import { GeoSubplot } from './subplot.ts';
import { createGeoView, type GeoFit, type GeoView } from './view.ts';

/** What every geo trace's calc carries. */
export interface GeoCalc {
  /** The subplot the trace is drawn on, set by {@link geoCrossTraceLayout}. */
  subplot: GeoSubplot | undefined;
  /**
   * The trace's part in `fitbounds`: the coordinates the view should hold, in degrees, and the px
   * to keep free around them (half the largest marker). Absent when the trace has none.
   */
  readonly fit?: { readonly lon: ArrayLike<number>; readonly lat: ArrayLike<number>; pad?: number };
  /**
   * Set by a trace given by `locations`: what they are and what they name (`locationsOf`). The
   * layout pass loads what they are matched against and calls {@link located}.
   */
  readonly locations?: LocationsRequest;
  /**
   * Called in every layout pass on a trace with {@link locations}, before the view is fitted: with
   * the features and points of its locations, or with `undefined` while what they are matched
   * against is loading or could not be loaded. The trace sets what follows from them, its `fit`
   * included. An answer that did not change is the same object as in the pass before.
   */
  located?(result: LocationsResult | undefined): void;
}

/** Subplots laid out in the latest pass, by the layout they were built for. */
const LAID_OUT = new WeakMap<FullLayout, Map<string, GeoSubplot>>();

/** The views of a chart's subplots in its latest pass, so the next pass can continue them. */
const VIEWS = new WeakMap<Chart, Map<string, GeoView>>();

/** Projection types whose chunk failed to load: warned once, and not asked for again. */
const FAILED = new Set<string>();

/** The subplots {@link geoCrossTraceLayout} built for `fullLayout`, if it ran for it. */
export function laidOutGeoSubplots(
  fullLayout: FullLayout,
): ReadonlyMap<string, GeoSubplot> | undefined {
  return LAID_OUT.get(fullLayout);
}

/**
 * The data extent of a subplot's traces, for `fitbounds`. With `fitbounds: 'geojson'` a trace
 * with `locationmode: 'geojson-id'` counts with every coordinate of its `geojson` instead of its
 * own points, as long as that has any (Plotly's `fitCoords`).
 */
function fitOf(
  entries: readonly DomainTraceEntry<GeoCalc>[],
  fitbounds: unknown,
  data: SubplotLocationData,
): GeoFit | undefined {
  const points: (readonly [number, number])[] = [];
  let pad = 0;
  for (const e of entries) {
    const request = e.calc.locations;
    if (fitbounds === 'geojson' && request?.locationmode === 'geojson-id') {
      const whole = geojsonCoords(data.geojson(request));
      if (whole.length > 0) {
        for (const p of whole) points.push(p);
        continue;
      }
    }
    const fit = e.calc.fit;
    if (!fit) continue;
    const n = Math.min(fit.lon.length, fit.lat.length);
    for (let i = 0; i < n; i++) {
      const lon = fit.lon[i] as number;
      const lat = fit.lat[i] as number;
      if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat]);
    }
    pad = Math.max(pad, fit.pad ?? 0);
  }
  return points.length > 0 ? { points, pad } : undefined;
}

/** The loads of projection code a chart waits for, by type; see {@link projectionLoad}. */
const PROJECTION_LOADS = new WeakMap<object, Map<string, Promise<void>>>();
/** For layout passes without a chart (hand-built contexts). */
const DETACHED_LOADS = new Map<string, Promise<void>>();

/**
 * The load of the code of projection `type` for `chart`, started once per chart and type:
 * `undefined` when the code is there (or cannot be loaded, which is reported once: the subplot
 * then stays empty), else a promise that settles, without rejecting, when the load has settled
 * and the chart's layout pass has been asked to run again (`chart.resize()` reruns it without
 * touching the figure). The geo component holds `chart.ready` with it (`LoadingHold`), so `ready`,
 * update promises and image export resolve once the map is drawn, as for the basemap.
 */
export function projectionLoad(type: string, chart: Chart | undefined): Promise<void> | undefined {
  if (isProjectionReady(type) || FAILED.has(type)) return undefined;
  let loads = chart ? PROJECTION_LOADS.get(chart) : DETACHED_LOADS;
  if (!loads) PROJECTION_LOADS.set(chart as Chart, (loads = new Map()));
  let load = loads.get(type);
  if (!load) {
    const pending = loads;
    load = loadProjection(type)
      .then(
        () => undefined,
        (error: unknown) => {
          if (FAILED.has(type)) return;
          FAILED.add(type);
          console.warn(
            `[holochart] the '${type}' projection could not be loaded; its geo subplot is not drawn.`,
            error,
          );
        },
      )
      .then(() => {
        pending.delete(type);
        try {
          // Hand-built charts may answer nothing; a chart destroyed meanwhile has nothing to run.
          const pass = chart?.resize() as Promise<unknown> | undefined;
          pass?.catch?.(() => undefined);
        } catch {
          // Destroyed.
        }
      });
    loads.set(type, load);
  }
  return load;
}

/** The shared `crossTraceLayout` of the geo traces (see the module comment). */
export function geoCrossTraceLayout(
  entries: readonly DomainTraceEntry<GeoCalc>[],
  ctx: DomainLayoutContext,
): void {
  const bySubplot = new Map<string, DomainTraceEntry<GeoCalc>[]>();
  for (const e of entries) {
    const id = geoOf(e.trace);
    const list = bySubplot.get(id);
    if (list) list.push(e);
    else bySubplot.set(id, [e]);
  }
  const previous = ctx.chart && VIEWS.get(ctx.chart);
  const views = new Map<string, GeoView>();
  const built = new Map<string, GeoSubplot>();
  for (const [id, list] of bySubplot) {
    const layout = geoLayoutOf(ctx.fullLayout, id);
    const rect = geoSubplotRect(ctx.fullLayout, id, ctx.plotArea);
    if (!layout || !rect) {
      for (const e of list) e.calc.subplot = undefined;
      continue;
    }
    // Locations first: the points they give are what `fitbounds` fits the view to.
    const data = locationData(
      list.flatMap((e) => (e.calc.locations ? [e.calc.locations] : [])),
      layout,
      ctx.chart,
    );
    for (const e of list) {
      if (e.calc.locations) e.calc.located?.(data.locate(e.calc.locations));
    }
    let view: GeoView | undefined;
    if (isProjectionReady(layout.projection.type)) {
      view = createGeoView(
        layout,
        { width: rect.width, height: rect.height },
        {
          ...(layout.fitbounds && { fit: fitOf(list, layout.fitbounds, data) }),
          previous: previous?.get(id),
        },
      );
      views.set(id, view);
    } else {
      // Not awaited here: the pass it asks for builds the view.
      void projectionLoad(layout.projection.type, ctx.chart);
    }
    const subplot = new GeoSubplot({
      id,
      layout,
      rect,
      view,
      layers: data.layers,
      loading: data.loading,
      chart: ctx.chart,
    });
    built.set(id, subplot);
    for (const e of list) e.calc.subplot = subplot;
  }
  if (ctx.chart) VIEWS.set(ctx.chart, views);
  LAID_OUT.set(ctx.fullLayout, built);
}
