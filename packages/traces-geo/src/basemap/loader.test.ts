/**
 * How the basemap loader behaves around its data (backlog GEO2): caching, failures that must not
 * hold a chart, and files from `config.topojsonURL`. The chunk imports are mocked; `data.test.ts`
 * reads the real data.
 */
import { geoArea } from 'd3-geo';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLOTLY_LAYOUT } from './__fixtures__/plotly-layout.ts';
import { loadChunk } from './chunks.ts';
import {
  basemapFileName,
  basemapFileUrl,
  clearBasemapCache,
  loadBasemap,
  peekBasemap,
} from './index.ts';

vi.mock('./chunks.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./chunks.ts')>();
  return { loadChunk: vi.fn(actual.loadChunk) };
});

const actualChunks = await vi.importActual<typeof import('./chunks.ts')>('./chunks.ts');
const chunk = vi.mocked(loadChunk);

/** A `fetch` that answers every request with `body` as JSON. */
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

beforeEach(() => {
  clearBasemapCache();
  chunk.mockReset();
  chunk.mockImplementation(actualChunks.loadChunk);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('loadBasemap, bundled data', () => {
  it('resolves with the same object for the same request and loads each chunk once', async () => {
    const first = await loadBasemap(110, 'world');
    const second = await loadBasemap(110, 'world');
    expect(second).toBe(first);
    expect(peekBasemap(110, 'world')).toBe(first);
    expect(chunk).toHaveBeenCalledTimes(1);
    expect(chunk).toHaveBeenCalledWith('base', 110);

    // Another scope of the same resolution decodes the chunk that is already there.
    const europe = await loadBasemap(110, 'europe');
    expect(europe).not.toBe(first);
    expect(chunk).toHaveBeenCalledTimes(1);

    // The extras are their own chunk and their own cache entry.
    const full = await loadBasemap(110, 'world', { extras: true });
    expect(full).not.toBe(first);
    expect(full.lakes).toBeDefined();
    expect(chunk).toHaveBeenCalledTimes(2);
    expect(chunk).toHaveBeenLastCalledWith('extras', 110);
    expect(await loadBasemap(110, 'world', { extras: true })).toBe(full);
  });

  it('shares one load between calls made before it settles', async () => {
    const [a, b] = await Promise.all([loadBasemap(110, 'africa'), loadBasemap(110, 'africa')]);
    expect(a).toBe(b);
    expect(chunk).toHaveBeenCalledTimes(1);
  });

  it('has nothing to peek at before a load', async () => {
    expect(peekBasemap(110, 'world')).toBeUndefined();
    const pending = loadBasemap(110, 'world');
    expect(peekBasemap(110, 'world')).toBeUndefined();
    await pending;
    expect(peekBasemap(110, 'world')).toBeDefined();
    expect(peekBasemap(110, 'world', { extras: true })).toBeUndefined();
    expect(peekBasemap(50, 'world')).toBeUndefined();
  });

  it('never fetches', async () => {
    const fetchMock = fetchAnswering(PLOTLY_LAYOUT);
    await loadBasemap(110, 'usa', { extras: true });
    // An empty topojsonURL is the bundled data too, and the same cache entry.
    const empty = await loadBasemap(110, 'usa', { extras: true, url: '' });
    expect(empty).toBe(peekBasemap(110, 'usa', { extras: true }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the base chunk fails, naming the resolution, and tries again next time', async () => {
    chunk.mockRejectedValueOnce(new Error('chunk 404'));
    await expect(loadBasemap(50, 'world')).rejects.toThrow(/1:50m basemap.*chunk 404/);
    expect(peekBasemap(50, 'world')).toBeUndefined();

    const layers = await loadBasemap(50, 'world');
    expect(layers.countries?.length).toBeGreaterThan(200);
    expect(chunk).toHaveBeenCalledTimes(2);
  });

  it('resolves with the base layers and warns once when only the extras fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    chunk.mockImplementation((part, resolution) =>
      part === 'extras'
        ? Promise.reject(new Error('extras 404'))
        : actualChunks.loadChunk(part, resolution),
    );

    const world = await loadBasemap(110, 'world', { extras: true });
    expect(world.countries?.length).toBe(177);
    expect(world.land).toBeDefined();
    expect(world.lakes).toBeUndefined();
    expect(world.subunits).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/1:110m/);

    // Another scope and another try: the same resolution does not warn again.
    await loadBasemap(110, 'usa', { extras: true });
    await loadBasemap(110, 'world', { extras: true });
    expect(warn).toHaveBeenCalledTimes(1);
    // The partial result is not kept, so the extras are tried again once they can load.
    expect(peekBasemap(110, 'world', { extras: true })).toBeUndefined();
    chunk.mockImplementation(actualChunks.loadChunk);
    const retried = await loadBasemap(110, 'world', { extras: true });
    expect(retried.lakes).toBeDefined();
    expect(peekBasemap(110, 'world', { extras: true })).toBe(retried);

    // Another resolution warns for itself.
    chunk.mockImplementation((part, resolution) =>
      part === 'extras'
        ? Promise.reject(new Error('gone'))
        : actualChunks.loadChunk(part, resolution),
    );
    await loadBasemap(50, 'usa', { extras: true });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('warns and keeps the base when the extras chunk belongs to another base', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    chunk.mockImplementation((part, resolution) =>
      // The 1:50m extras against the 1:110m base: their arc indices would point anywhere.
      actualChunks.loadChunk(part, part === 'extras' ? 50 : resolution),
    );
    const layers = await loadBasemap(110, 'world', { extras: true });
    expect(layers.countries).toBeDefined();
    expect(layers.rivers).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('settles when a chunk never arrives', async () => {
    vi.useFakeTimers();
    chunk.mockImplementation(() => new Promise<string>(() => undefined));
    const outcome = loadBasemap(110, 'world', { timeout: 5_000 }).then(
      () => 'resolved',
      (error: unknown) => String(error),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toMatch(/1:110m basemap.*longer than 5000 ms/);
  });
});

describe('loadBasemap, a topojsonURL', () => {
  it("names files as Plotly's does", () => {
    expect(basemapFileName('world', 110)).toBe('world_110m');
    expect(basemapFileName('usa', 50)).toBe('usa_50m');
    expect(basemapFileName('north america', 110)).toBe('north-america_110m');
    expect(basemapFileName('south america', 50)).toBe('south-america_50m');
    expect(basemapFileUrl('https://cdn.example/topojson/', 'world', 110)).toBe(
      'https://cdn.example/topojson/world_110m.json',
    );
    // Plotly adds the slash a URL lacks.
    expect(basemapFileUrl('/maps', 'north america', 50)).toBe('/maps/north-america_50m.json');
  });

  it("decodes a file in Plotly's layout into the same layers", async () => {
    const fetchMock = fetchAnswering(PLOTLY_LAYOUT);
    const layers = await loadBasemap(110, 'north america', { url: '/maps/', extras: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/maps/north-america_110m.json');
    expect(chunk).not.toHaveBeenCalled();

    // The feature without an id is still a country; Plotly's files have no names, so ids stand in.
    expect(layers.countries?.map((country) => country.id)).toEqual(['AAA', 'BBB', undefined]);
    expect(layers.countries?.[0]?.properties).toEqual({ name: 'AAA', ct: [0.5, 0.5] });
    // A feature without `ct` gets a point from its outline.
    const [x, y] = layers.countries?.[2]?.properties.ct ?? [];
    expect(x).toBeCloseTo(0.3);
    expect(y).toBeCloseTo(0.3);
    // The border runs the way its first country walks it: AAA goes south along it.
    expect(layers.borders).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [1, 1],
          [1, 0],
        ],
      ],
    });
    expect(layers.land?.coordinates).toHaveLength(1);
    expect(layers.land?.coordinates[0]?.[0]).toHaveLength(7);
    expect(geoArea(layers.land ?? { type: 'MultiPolygon', coordinates: [] })).toBeLessThan(1);
    expect(layers.coastlines?.coordinates).toHaveLength(1);
    expect(layers.lakes?.coordinates).toHaveLength(1);
    expect(layers.rivers?.coordinates).toEqual([
      [
        [0.5, 0.5],
        [1.5, 0.5],
      ],
    ]);
    expect(layers.subunits?.map((subunit) => subunit.id)).toEqual(['S', 'N']);
    expect(layers.subunits?.[0]?.properties).toEqual({ name: 'S', gu: 'BBB', ct: [1.5, 0.25] });
    expect(layers.subunitBorders?.coordinates).toEqual([
      [
        [1, 0.5],
        [2, 0.5],
      ],
    ]);

    // Cached per request; the file itself is fetched once for both.
    expect(await loadBasemap(110, 'north america', { url: '/maps/', extras: true })).toBe(layers);
    const base = await loadBasemap(110, 'north america', { url: '/maps/' });
    expect(base.countries).toHaveLength(3);
    expect(base.lakes).toBeUndefined();
    expect(base.subunits).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Bundled data of the same scope is another request.
    expect(peekBasemap(110, 'north america')).toBeUndefined();
  });

  it('draws the outline of the land when a file has no coastlines', async () => {
    const { coastlines: _coastlines, ...objects } = PLOTLY_LAYOUT.objects;
    fetchAnswering({ ...PLOTLY_LAYOUT, objects });
    const layers = await loadBasemap(50, 'world', { url: 'https://cdn.example/' });
    expect(layers.coastlines?.coordinates.length).toBeGreaterThan(0);
  });

  it('rejects on an HTTP error or a file that is not a topology, and tries again next time', async () => {
    const missing = fetchAnswering({}, 404);
    await expect(loadBasemap(50, 'usa', { url: '/maps' })).rejects.toThrow(
      /1:50m basemap.*\/maps\/usa_50m\.json answered 404/,
    );
    expect(missing).toHaveBeenCalledTimes(1);

    fetchAnswering({ type: 'FeatureCollection', features: [] });
    await expect(loadBasemap(50, 'usa', { url: '/maps' })).rejects.toThrow(
      /not a TopoJSON topology/,
    );

    const fetchMock = fetchAnswering(PLOTLY_LAYOUT);
    const layers = await loadBasemap(50, 'usa', { url: '/maps' });
    expect(layers.countries).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a request that hangs', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }),
    );
    const outcome = loadBasemap(110, 'world', { url: '/maps', timeout: 2_000 }).then(
      () => 'resolved',
      (error: unknown) => String(error),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await outcome).toMatch(/1:110m basemap.*world_110m\.json took longer than 2000 ms/);
    expect(signal?.aborted).toBe(true);
  });
});
