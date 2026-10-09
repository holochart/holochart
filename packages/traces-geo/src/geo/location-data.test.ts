/**
 * Getting the data of locations in hand (backlog GEO3, GEO4): what is asked of the basemap loader,
 * `geojson` files and the country-name chunk, the pass that runs again when a load settles, and
 * loads that fail. The basemap loader is a stub; `fetch` is stubbed per test.
 */
import type { Primitive } from '@mk7s/holochart-render';
import type { Chart } from '@mk7s/holochart-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBasemap, peekBasemap, type BasemapOptions } from '../basemap/index.ts';
import {
  clearLocationData,
  fetchGeojson,
  LoadingHold,
  LOCATION_DATA_TIMEOUT,
  locationData,
} from './location-data.ts';
import type { LocationsRequest } from './locations.ts';
import type { BasemapLayers, FullGeoLayout } from './types.ts';

vi.mock('../basemap/index.ts', () => ({
  peekBasemap: vi.fn(),
  loadBasemap: vi.fn(),
}));

const square = (x: number, y: number): number[][][] => [
  [
    [x, y],
    [x, y + 2],
    [x + 2, y + 2],
    [x + 2, y],
    [x, y],
  ],
];

function basemap(extras = true): BasemapLayers {
  return {
    countries: [
      {
        type: 'Feature',
        id: 'FRA',
        properties: { name: 'France', ct: [2, 47] },
        geometry: { type: 'Polygon', coordinates: square(1, 46) },
      },
    ],
    ...(extras
      ? {
          subunits: [
            {
              type: 'Feature',
              id: 'CA',
              properties: { name: 'California', gu: 'USA', ct: [-120, 37] },
              geometry: { type: 'Polygon', coordinates: square(-121, 36) },
            },
          ],
        }
      : {}),
  };
}

const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'a',
      properties: { name: 'A' },
      geometry: { type: 'Polygon', coordinates: square(10, 10) },
    },
  ],
};

function layoutOf(over: Partial<FullGeoLayout> = {}): FullGeoLayout {
  return {
    resolution: 110,
    scope: 'world',
    showlakes: false,
    showrivers: false,
    showsubunits: false,
    ...over,
  } as FullGeoLayout;
}

function request(
  locations: unknown[],
  locationmode: LocationsRequest['locationmode'] = 'ISO-3',
  geojson?: unknown,
): LocationsRequest {
  return { locations, locationmode, featureidkey: 'id', geojson };
}

interface FakeChart {
  resize: ReturnType<typeof vi.fn>;
  fullConfig: { topojsonURL: string };
}

function fakeChart(topojsonURL = ''): FakeChart & Chart {
  return { resize: vi.fn(() => Promise.resolve()), fullConfig: { topojsonURL } } as never;
}

const keyOf = (resolution: number, scope: string, o: BasemapOptions = {}): string =>
  `${resolution}|${scope}|${o.extras ? 1 : 0}|${o.url ?? ''}`;

/** Basemaps the stub has loaded, and the loads it has not answered yet. */
let cached: Map<string, BasemapLayers>;
let loads: Map<
  string,
  { resolve(layers: BasemapLayers, keep?: boolean): void; reject(e: Error): void }
>;

beforeEach(() => {
  clearLocationData();
  cached = new Map();
  loads = new Map();
  vi.mocked(peekBasemap).mockReset();
  vi.mocked(loadBasemap).mockReset();
  vi.mocked(peekBasemap).mockImplementation((resolution, scope, o) =>
    cached.get(keyOf(resolution, scope, o)),
  );
  vi.mocked(loadBasemap).mockImplementation((resolution, scope, o) => {
    const key = keyOf(resolution, scope, o);
    const have = cached.get(key);
    if (have) return Promise.resolve(have);
    return new Promise<BasemapLayers>((resolve, reject) => {
      loads.set(key, {
        // `keep: false` is a basemap that came without its extras: the loader does not cache it.
        resolve(layers, keep = true) {
          if (keep) cached.set(key, layers);
          resolve(layers);
        },
        reject,
      });
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A `fetch` that answers with `body` as JSON. */
function fetchAnswering(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('locationData: the basemap', () => {
  it('asks for nothing when no trace is matched against the basemap', () => {
    const chart = fakeChart();
    const none = locationData([], layoutOf(), chart);
    expect(none.loading).toBeUndefined();
    expect(none.layers).toBeUndefined();
    const custom = locationData([request(['a'], 'geojson-id', GEOJSON)], layoutOf(), chart);
    expect(custom.loading).toBeUndefined();
    expect(custom.locate(request(['a'], 'geojson-id', GEOJSON))!.features[0]!.id).toBe('a');
    expect(custom.layers).toBeUndefined();
    expect(loadBasemap).not.toHaveBeenCalled();
    expect(peekBasemap).not.toHaveBeenCalled();
  });

  it('loads the basemap once, and has the layout pass run again when it arrives', async () => {
    const chart = fakeChart();
    const req = request(['FRA']);
    const first = locationData([req], layoutOf(), chart);
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', { extras: false });
    expect(first.layers).toBeUndefined();
    expect(first.locate(req)).toBeUndefined();
    expect(first.loading).toBeInstanceOf(Promise);
    // Another pass meanwhile waits for the same load.
    const second = locationData([req], layoutOf(), chart);
    expect(second.loading).toBe(first.loading);
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    let settled = false;
    void first.loading!.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(settled).toBe(false);
    expect(chart.resize).not.toHaveBeenCalled();

    const layers = basemap(false);
    loads.get(keyOf(110, 'world'))!.resolve(layers);
    await first.loading;
    // The pass was asked for before readiness is let go.
    expect(chart.resize).toHaveBeenCalledTimes(1);
    const third = locationData([req], layoutOf(), chart);
    expect(third.loading).toBeUndefined();
    expect(third.layers).toBe(layers);
    expect(third.locate(req)!.features[0]!.id).toBe('FRA');
    expect(loadBasemap).toHaveBeenCalledTimes(1);
  });

  it("asks for the extras for 'USA-states' and for a layout that shows them, and passes the URL", () => {
    locationData([request(['CA'], 'USA-states')], layoutOf(), fakeChart());
    expect(loadBasemap).toHaveBeenLastCalledWith(110, 'world', { extras: true });
    locationData([request(['FRA'])], layoutOf({ showrivers: true, resolution: 50 }), fakeChart());
    expect(loadBasemap).toHaveBeenLastCalledWith(50, 'world', { extras: true });
    locationData(
      [request(['FRA'])],
      layoutOf({ scope: 'europe' }),
      fakeChart('https://maps.example/'),
    );
    expect(loadBasemap).toHaveBeenLastCalledWith(110, 'europe', {
      extras: false,
      url: 'https://maps.example/',
    });
    expect(peekBasemap).toHaveBeenLastCalledWith(110, 'europe', {
      extras: false,
      url: 'https://maps.example/',
    });
  });

  it('reports a basemap that cannot be loaded once, and does not ask this chart’s loader again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart();
    const req = request(['FRA']);
    const first = locationData([req], layoutOf(), chart);
    loads.get(keyOf(110, 'world'))!.reject(new Error('offline'));
    await first.loading;
    expect(chart.resize).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[holochart] the 1:110m basemap could not be loaded; traces given by `locations` are not drawn.',
    );
    for (let pass = 0; pass < 3; pass++) {
      const next = locationData([req], layoutOf(), chart);
      expect(next.loading).toBeUndefined();
      expect(next.locate(req)).toBeUndefined();
    }
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    // Another chart tries again.
    expect(locationData([req], layoutOf(), fakeChart()).loading).toBeInstanceOf(Promise);
    expect(loadBasemap).toHaveBeenCalledTimes(2);
  });

  it('keeps a basemap that came without its extras, and says that states are not drawn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart();
    const states = request(['CA'], 'USA-states');
    const iso = request(['FRA']);
    const first = locationData([states, iso], layoutOf(), chart);
    const layers = basemap(false);
    loads.get(keyOf(110, 'world', { extras: true }))!.resolve(layers, false);
    await first.loading;
    expect(peekBasemap(110, 'world', { extras: true })).toBeUndefined();
    for (let pass = 0; pass < 3; pass++) {
      const next = locationData([states, iso], layoutOf(), chart);
      // Not loaded again on every pass.
      expect(next.loading).toBeUndefined();
      expect(next.layers).toBe(layers);
      expect(next.locate(states)).toBeUndefined();
      expect(next.locate(iso)!.features[0]!.id).toBe('FRA');
    }
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/the states of the 1:110m basemap could not be loaded/);
  });

  it('works without a chart, and survives a chart that was destroyed meanwhile', async () => {
    const req = request(['FRA']);
    const detached = locationData([req], layoutOf(), undefined);
    loads.get(keyOf(110, 'world'))!.resolve(basemap());
    await detached.loading;
    expect(locationData([req], layoutOf(), undefined).locate(req)!.features[0]!.id).toBe('FRA');

    cached.clear();
    const gone = {
      resize: vi.fn(() => Promise.reject(new Error('destroyed'))),
      fullConfig: {},
    } as never as Chart;
    const pending = locationData([req], layoutOf(), gone);
    loads.get(keyOf(110, 'world'))!.resolve(basemap());
    await expect(pending.loading).resolves.toBeUndefined();
    const thrown = {
      resize: vi.fn(() => {
        throw new Error('destroyed');
      }),
      fullConfig: {},
    } as never as Chart;
    cached.clear();
    const again = locationData([req], layoutOf(), thrown);
    loads.get(keyOf(110, 'world'))!.resolve(basemap());
    await expect(again.loading).resolves.toBeUndefined();
  });
});

describe('locationData: a `geojson` URL', () => {
  const URL = 'https://data.example/areas.json';

  it('fetches the file once for the page and locates with it', async () => {
    const fetchMock = fetchAnswering(GEOJSON);
    const chart = fakeChart();
    const req = request(['a', 'b'], 'geojson-id', URL);
    const first = locationData([req, request(['a'], 'geojson-id', URL)], layoutOf(), chart);
    expect(first.geojson(req)).toBeUndefined();
    expect(first.locate(req)).toBeUndefined();
    expect(first.loading).toBeInstanceOf(Promise);
    expect(loadBasemap).not.toHaveBeenCalled();
    await first.loading;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(URL);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(chart.resize).toHaveBeenCalledTimes(1);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = locationData([req], layoutOf(), chart);
    expect(second.loading).toBeUndefined();
    expect(second.geojson(req)).toBe(GEOJSON);
    expect(second.locate(req)!.features.map((f) => f?.id)).toEqual(['a', undefined]);
    expect(warn).toHaveBeenCalledTimes(1);
    // Another chart finds the file there.
    const other = locationData([req], layoutOf(), fakeChart());
    expect(other.loading).toBeUndefined();
    expect(other.locate(req)).toBe(second.locate(req));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a file that cannot be fetched once, and leaves the chart ready', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = fetchAnswering({}, 404);
    const chart = fakeChart();
    const req = request(['a'], 'geojson-id', URL);
    const first = locationData([req], layoutOf(), chart);
    await first.loading;
    expect(chart.resize).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      `[holochart] the GeoJSON at "${URL}" could not be loaded; the traces that use it are not drawn.`,
    );
    expect((warn.mock.calls[0]![1] as Error).message).toBe(`${URL} answered 404`);
    for (let pass = 0; pass < 3; pass++) {
      const next = locationData([req], layoutOf(), chart);
      expect(next.loading).toBeUndefined();
      expect(next.locate(req)).toBeUndefined();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    // The failure is this chart's: a new chart fetches again.
    fetchAnswering(GEOJSON);
    const fresh = locationData([req], layoutOf(), fakeChart());
    await fresh.loading;
    expect(locationData([req], layoutOf(), fakeChart()).locate(req)!.features[0]!.id).toBe('a');
  });

  it('rejects an answer that is not a JSON object, and a network error', async () => {
    fetchAnswering([1, 2]);
    await expect(fetchGeojson(URL)).rejects.toThrow(`${URL} is not a GeoJSON object`);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(fetchGeojson(URL)).rejects.toThrow('Failed to fetch');
    // Neither failure is remembered.
    fetchAnswering(GEOJSON);
    await expect(fetchGeojson(URL)).resolves.toBe(GEOJSON);
  });

  it('gives up on a file that takes too long: the request is aborted and the chart is ready', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    // A server that never answers, and a `fetch` that does not settle on abort either.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return new Promise(() => {});
      }),
    );
    const chart = fakeChart();
    const req = request(['a'], 'geojson-id', URL);
    const first = locationData([req], layoutOf(), chart);
    let settled = false;
    void first.loading!.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(LOCATION_DATA_TIMEOUT - 1);
    expect(settled).toBe(false);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(signal!.aborted).toBe(true);
    expect(chart.resize).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect((warn.mock.calls[0]![1] as Error).message).toBe(
      `${URL} took longer than ${LOCATION_DATA_TIMEOUT} ms`,
    );
    expect(locationData([req], layoutOf(), chart).loading).toBeUndefined();
  });
});

describe('locationData: the country-name table', () => {
  it('loads the table’s chunk for the first trace that needs it', async () => {
    cached.set(keyOf(110, 'world'), basemap());
    const chart = fakeChart();
    const req = request(['France', 'Atlantis'], 'country names');
    // Other modes do not load it.
    expect(locationData([request(['FRA'])], layoutOf(), chart).loading).toBeUndefined();
    const first = locationData([req], layoutOf(), chart);
    expect(first.locate(req)).toBeUndefined();
    expect(first.loading).toBeInstanceOf(Promise);
    await first.loading;
    expect(chart.resize).toHaveBeenCalledTimes(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = locationData([req], layoutOf(), chart);
    expect(second.loading).toBeUndefined();
    const result = second.locate(req)!;
    expect(result.features.map((f) => f?.id)).toEqual(['FRA', undefined]);
    expect(result.unmatched).toEqual(['Atlantis']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('waits for the basemap and the table together', async () => {
    const chart = fakeChart();
    const req = request(['France'], 'country names');
    const first = locationData([req], layoutOf(), chart);
    let settled = false;
    void first.loading!.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The table is there; the basemap is not.
    expect(settled).toBe(false);
    loads.get(keyOf(110, 'world'))!.resolve(basemap());
    await first.loading;
    expect(locationData([req], layoutOf(), chart).locate(req)!.features[0]!.id).toBe('FRA');
  });
});

describe('LoadingHold', () => {
  it('holds a hidden primitive whose `ready` is the load, while there is one', () => {
    const held = new Set<Primitive<unknown>>();
    const host = {
      add: <T>(p: Primitive<T>): Primitive<T> => {
        held.add(p as Primitive<unknown>);
        return p;
      },
      remove: <T>(p: Primitive<T>): void => void held.delete(p as Primitive<unknown>),
    };
    const hold = new LoadingHold();
    hold.follow(host, undefined);
    expect(held.size).toBe(0);
    const loading = Promise.resolve();
    hold.follow(host, loading);
    hold.follow(host, loading);
    expect(held.size).toBe(1);
    const [pending] = [...held] as [Primitive<unknown> & { ready: Promise<void> }];
    expect(pending.ready).toBe(loading);
    expect(pending.object.visible).toBe(false);
    // Another load replaces it; none lets go.
    const next = Promise.resolve();
    hold.follow(host, next);
    expect(held.size).toBe(1);
    expect(held.has(pending)).toBe(false);
    hold.follow(host, undefined);
    expect(held.size).toBe(0);
  });
});
