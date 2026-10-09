import { describe, expect, it } from 'vitest';
import {
  compass,
  describeCode,
  forecastUrl,
  loadWeather,
  normalizeZip,
  parseForecast,
  parsePlace,
  WeatherError,
  type Fetch,
  type Place,
} from '../../examples/demos/live-weather/data.mts';
import {
  dailyExtremes,
  dayLabel,
  GRID_METRICS,
  hourGrid,
  hourGridFigure,
  nightBands,
  precipFigure,
  runningTotal,
  sideMargins,
  skyFigure,
  temperatureFigure,
  timeRange,
  windFigure,
  windRose,
  windRoseFigure,
} from '../../examples/demos/live-weather/charts.mts';
import {
  linkCharts,
  xRangeAfter,
  type LinkedChart,
} from '../../examples/demos/live-weather/link.mts';
import { clock, headline } from '../../examples/demos/live-weather/summary.mts';
import { sampleForecast, samplePayload } from './live-weather.fixture.ts';

const DALLAS: Place = {
  zip: '75201',
  name: 'Dallas',
  state: 'TX',
  latitude: 32.7904,
  longitude: -96.8044,
};

const ZIP_PAYLOAD = {
  'post code': '75201',
  places: [
    {
      'place name': 'Dallas',
      longitude: '-96.8044',
      latitude: '32.7904',
      'state abbreviation': 'TX',
    },
  ],
};

const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const kindOf = async (run: () => unknown): Promise<string> => {
  try {
    await run();
  } catch (error) {
    return error instanceof WeatherError ? error.kind : `unexpected: ${String(error)}`;
  }
  return 'no error';
};

describe('live weather: zip codes', () => {
  it('accepts five digits and ZIP+4, and rejects everything else before any request', async () => {
    expect(normalizeZip(' 75201 ')).toBe('75201');
    expect(normalizeZip('75201-1234')).toBe('75201');
    let calls = 0;
    const fetchFn: Fetch = () => {
      calls++;
      return Promise.resolve(reply(200, {}));
    };
    for (const bad of ['', '7520', '752011', 'dallas', '75201-12']) {
      expect(await kindOf(() => loadWeather(bad, fetchFn))).toBe('zip');
    }
    expect(calls).toBe(0);
  });

  it('reads the place from the lookup and reports an unknown zip', () => {
    expect(parsePlace('75201', ZIP_PAYLOAD)).toEqual(DALLAS);
    expect(() => parsePlace('00000', {})).toThrow(WeatherError);
    expect(() => parsePlace('00000', { places: [{ latitude: 'x', longitude: '1' }] })).toThrow(
      /00000/,
    );
  });
});

describe('live weather: requests', () => {
  it('asks for the zip, then for the forecast at its coordinates in US units', async () => {
    const urls: string[] = [];
    const fetchFn: Fetch = (url) => {
      urls.push(url);
      return Promise.resolve(reply(200, urls.length === 1 ? ZIP_PAYLOAD : samplePayload()));
    };
    const forecast = await loadWeather('75201', fetchFn);
    expect(urls[0]).toBe('https://api.zippopotam.us/us/75201');
    const query = new URL(urls[1] as string).searchParams;
    expect(urls[1]).toBe(forecastUrl(DALLAS));
    expect(query.get('latitude')).toBe('32.7904');
    expect(query.get('longitude')).toBe('-96.8044');
    expect(query.get('temperature_unit')).toBe('fahrenheit');
    expect(query.get('wind_speed_unit')).toBe('mph');
    expect(query.get('precipitation_unit')).toBe('inch');
    expect(query.get('timezone')).toBe('auto');
    expect(forecast.place).toEqual(DALLAS);
  });

  it('turns a 404, a failed request and a bad status into errors the page can explain', async () => {
    expect(await kindOf(() => loadWeather('00000', () => Promise.resolve(reply(404, {}))))).toBe(
      'not-found',
    );
    expect(
      await kindOf(() => loadWeather('75201', () => Promise.reject(new TypeError('failed')))),
    ).toBe('network');
    let n = 0;
    const down: Fetch = () => Promise.resolve(n++ === 0 ? reply(200, ZIP_PAYLOAD) : reply(503, {}));
    expect(await kindOf(() => loadWeather('75201', down))).toBe('network');
    // The zip lookup, then the forecast and its one retry.
    expect(n).toBe(3);
  });

  it('asks once more after a server error', async () => {
    const statuses = [503, 200, 503, 200];
    const urls: string[] = [];
    const fetchFn: Fetch = (url) => {
      urls.push(url);
      const status = statuses[urls.length - 1] as number;
      return Promise.resolve(reply(status, urls.length <= 2 ? ZIP_PAYLOAD : samplePayload()));
    };
    expect((await loadWeather('75201', fetchFn)).place.name).toBe('Dallas');
    expect(urls).toHaveLength(4);
    expect(urls[0]).toBe(urls[1]);
    expect(urls[2]).toBe(urls[3]);
  });

  it('lets an abort through unchanged, so a superseded request is not shown as an error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(loadWeather('75201', () => Promise.reject(abort))).rejects.toBe(abort);
  });
});

describe('live weather: the forecast payload', () => {
  it('reshapes hourly and daily series and converts pressure to inches of mercury', () => {
    const f = sampleForecast();
    expect(f.timezone).toBe('America/Chicago');
    expect(f.hourly.time).toHaveLength(72);
    expect(f.hourly.time[0]).toBe('2026-10-03T00:00');
    for (const key of Object.keys(f.hourly) as (keyof typeof f.hourly)[]) {
      expect(f.hourly[key]).toHaveLength(72);
    }
    // 1013.25 hPa is one standard atmosphere, 29.92 inHg.
    expect(f.hourly.pressure[0]).toBeCloseTo(29.92, 2);
    expect(f.current.pressure).toBeCloseTo(29.92, 2);
    expect(f.days.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
    expect(f.days[0]).toMatchObject({ code: 61, high: 80, low: 60, sunrise: '2026-10-03T07:22' });
    expect(f.current).toMatchObject({ time: '2026-10-03T14:15', isDay: true, code: 2 });
  });

  it('keeps gaps as nulls and pads a short series', () => {
    const raw = samplePayload();
    raw.hourly.temperature_2m = [70, null, 'n/a', 71] as never;
    const f = parseForecast(DALLAS, raw);
    expect(f.hourly.temperature.slice(0, 5)).toEqual([70, null, null, 71, null]);
    expect(f.hourly.temperature).toHaveLength(72);
  });

  it('rejects a payload without hourly data', () => {
    for (const raw of [null, {}, { hourly: { time: [] }, daily: { time: [] } }, { error: true }]) {
      expect(() => parseForecast(DALLAS, raw)).toThrow(WeatherError);
    }
  });
});

describe('live weather: labels', () => {
  it('names WMO weather codes and picks an icon family', () => {
    expect(describeCode(0)).toEqual({ label: 'Clear', sky: 'clear' });
    expect(describeCode(2).sky).toBe('partly');
    expect(describeCode(81)).toEqual({ label: 'Showers', sky: 'rain' });
    expect(describeCode(75).sky).toBe('snow');
    expect(describeCode(99).sky).toBe('storm');
    expect(describeCode(1234).sky).toBe('cloudy');
  });

  it('maps degrees to sixteen compass points', () => {
    expect([0, 11, 12, 90, 180, 225, 348.75, 360, -90].map(compass)).toEqual([
      'N',
      'N',
      'NNE',
      'E',
      'S',
      'SW',
      'N',
      'N',
      'W',
    ]);
  });
});

describe('live weather: figures', () => {
  const view = { narrow: false, days: 3 };
  const f = sampleForecast();

  it('shares one time axis, night bands and a now line across the time-series figures', () => {
    expect(timeRange(f, 2)).toEqual(['2026-10-03T00:00', '2026-10-05T00:00']);
    expect(timeRange(f, 99)).toEqual(['2026-10-03T00:00', '2026-10-06T00:00']);
    const bands = nightBands(f);
    expect(bands.map((b) => [b.x0, b.x1])).toEqual([
      ['2026-10-03T00:00', '2026-10-03T07:22'],
      ['2026-10-03T19:08', '2026-10-04T07:22'],
      ['2026-10-04T19:08', '2026-10-05T07:22'],
      ['2026-10-05T19:08', '2026-10-06T00:00'],
    ]);
    const figures = [temperatureFigure, skyFigure, precipFigure, windFigure].map((b) => b(f, view));
    for (const figure of figures) {
      expect(figure.layout?.xaxis?.range).toEqual(['2026-10-03T00:00', '2026-10-06T00:00']);
      expect(figure.layout?.margin).toMatchObject(sideMargins(false));
      const shapes = figure.layout?.shapes ?? [];
      expect(shapes).toHaveLength(5);
      expect(shapes.at(-1)).toMatchObject({ type: 'line', x0: '2026-10-03T14:15' });
    }
  });

  it('labels each day’s hottest and coldest hour on the temperature figure', () => {
    expect(dailyExtremes(f)).toEqual({ high: [15, 39, 63], low: [3, 27, 51] });
    const wide = temperatureFigure(f, view);
    expect(wide.data).toHaveLength(5);
    expect(wide.data?.[3]).toMatchObject({ text: ['80°', '80°', '80°'] });
    expect(wide.data?.[4]).toMatchObject({ text: ['60°', '60°', '60°'] });
    expect(temperatureFigure(f, { narrow: true, days: 3 }).data).toHaveLength(3);
  });

  it('puts pressure on a second axis that brackets the forecast', () => {
    const sky = skyFigure(f, view);
    expect(sky.data?.[3]).toMatchObject({ name: 'Pressure (inHg)', yaxis: 'y2' });
    const [lo, hi] = sky.layout?.yaxis2?.range as [number, number];
    expect(lo).toBeLessThanOrEqual(Math.min(...(f.hourly.pressure as number[])));
    expect(hi).toBeGreaterThanOrEqual(Math.max(...(f.hourly.pressure as number[])));
  });

  it('accumulates precipitation, and says so when none is forecast', () => {
    expect(runningTotal([0.1, null, 0.2])).toEqual([0.1, 0.1, expect.closeTo(0.3, 10)]);
    const wet = precipFigure(f, view);
    expect(wet.data).toHaveLength(2);
    expect((wet.data?.[1] as { y: number[] }).y.at(-1)).toBeCloseTo(0.4, 10);
    expect(wet.layout?.annotations).toEqual([]);

    const raw = samplePayload();
    raw.hourly.precipitation = raw.hourly.precipitation.map(() => 0);
    raw.hourly.snowfall = raw.hourly.snowfall.map((_, i) => (i === 30 ? 0.5 : 0));
    const dry = precipFigure(parseForecast(DALLAS, raw), view);
    expect(dry.data?.map((t) => t.name)).toEqual([
      'Hourly precipitation (in)',
      'Hourly snowfall (in)',
      'Total since midnight today (in)',
    ]);
    expect(dry.layout?.annotations).toHaveLength(1);
  });

  it('points the wind arrows downwind', () => {
    const wind = windFigure(f, view);
    const arrows = wind.data?.[2] as { x: string[]; marker: { angle: number[] } };
    expect(arrows.x).toHaveLength(12);
    expect(arrows.x[0]).toBe('2026-10-03T03:00');
    // From the south (180°) on the first day, so the arrow points north (0°); then from the north-west.
    expect(arrows.marker.angle.slice(0, 5)).toEqual([0, 0, 0, 0, 135]);
  });

  it('lays hours out as rows and days as columns for the heatmap', () => {
    const z = hourGrid(f, f.hourly.temperature);
    expect(z).toHaveLength(24);
    expect(z[15]).toEqual([80, 80, 80]);
    expect(z[3]?.map((v) => Math.round(v as number))).toEqual([60, 60, 60]);
    expect(dayLabel('2026-10-03')).toBe('Sat 10/3');
    for (const metric of Object.keys(GRID_METRICS) as (keyof typeof GRID_METRICS)[]) {
      const trace = hourGridFigure(f, metric, view).data?.[0] as { zmin: number; zmax: number };
      expect(trace.zmax).toBeGreaterThan(trace.zmin);
    }
  });

  it('counts every forecast hour once in the wind rose', () => {
    const { share, hours } = windRose(f);
    expect(hours).toBe(72);
    expect(share.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    const south = share.reduce((a, row) => a + (row[8] as number), 0);
    const northWest = share.reduce((a, row) => a + (row[14] as number), 0);
    expect(south).toBeCloseTo(100 / 3, 10);
    expect(northWest).toBeCloseTo(200 / 3, 10);
    expect(windRoseFigure(f, view).data).toHaveLength(5);
  });
});

describe('live weather: headline figures', () => {
  it('summarises now, today, the rain ahead and the wind', () => {
    const stats = headline(sampleForecast());
    expect(stats.map((s) => s.value)).toEqual(['80 °F', '80° / 60°', '0.40 in', '8 mph']);
    expect(stats[0]?.label).toBe('partly cloudy at 2:15 PM');
    expect(stats[1]?.aside).toBe('sunrise 7:22 AM · sunset 7:08 PM');
    expect(stats[2]?.aside).toBe('most on Sat 10/3: 0.40 in');
    expect(stats[3]?.label).toBe('wind from the SSW');
    expect(clock('2026-10-03T00:05')).toBe('12:05 AM');
  });
});

describe('live weather: linked charts', () => {
  const HOME = ['2026-10-03T00:00', '2026-10-06T00:00'] as const;

  it('reads the x range a relayout leaves behind', () => {
    expect(xRangeAfter({ 'yaxis.range[0]': 1 }, HOME, HOME)).toBeNull();
    expect(xRangeAfter({ 'xaxis.range[0]': 'a', 'xaxis.range[1]': 'b' }, HOME, HOME)).toEqual([
      'a',
      'b',
    ]);
    expect(xRangeAfter({ 'xaxis.range[1]': 'b' }, HOME, HOME)).toEqual([HOME[0], 'b']);
    expect(xRangeAfter({ 'xaxis.range': ['a', 'b'] }, HOME, HOME)).toEqual(['a', 'b']);
    expect(xRangeAfter({ 'xaxis.autorange': true }, ['a', 'b'], HOME)).toBe(HOME);
  });

  /** A stand-in for a chart: records calls, and echoes its own relayouts as events like the real one. */
  function fakeChart() {
    const listeners = new Map<string, ((payload: never) => void)[]>();
    const calls: unknown[][] = [];
    const emit = (type: string, payload: unknown): void => {
      for (const l of listeners.get(type) ?? []) l(payload as never);
    };
    const chart = {
      on(type: string, listener: (payload: never) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        return () =>
          listeners.set(
            type,
            (listeners.get(type) ?? []).filter((l) => l !== listener),
          );
      },
      relayout(update: Record<string, unknown>) {
        calls.push(['relayout', update]);
        emit('relayout', { ...update, 'xaxis.autorange': false });
        return Promise.resolve(chart);
      },
      hover(target: unknown) {
        calls.push(['hover', target]);
        emit('hover', { points: [], xvals: [(target as { xval: unknown }).xval] });
      },
      unhover() {
        calls.push(['unhover']);
        emit('unhover', { points: [] });
      },
    };
    return { chart: chart as unknown as LinkedChart, calls, emit };
  }

  it('applies one chart’s zoom to the others once, and its hover at the same x', async () => {
    const [a, b, c] = [fakeChart(), fakeChart(), fakeChart()];
    const link = linkCharts([a.chart, b.chart, c.chart], HOME);

    a.emit('relayout', { 'xaxis.range[0]': 'p', 'xaxis.range[1]': 'q' });
    await Promise.resolve();
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([['relayout', { 'xaxis.range': ['p', 'q'] }]]);
    expect(c.calls).toEqual(b.calls);

    await new Promise((resolve) => setTimeout(resolve, 0));
    b.emit('relayout', { 'xaxis.autorange': true });
    const home = ['relayout', { 'xaxis.range': [...HOME] }];
    expect(a.calls.at(-1)).toEqual(home);
    expect(b.calls.at(-1)).toEqual(home);
    expect(c.calls).toHaveLength(2);

    for (const chart of [a, b, c]) chart.calls.length = 0;
    a.emit('hover', { points: [], xvals: [42], event: {} });
    a.emit('unhover', { points: [], event: {} });
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([['hover', { xval: 42 }], ['unhover']]);
    expect(c.calls).toEqual(b.calls);

    await new Promise((resolve) => setTimeout(resolve, 0));
    link.show(['s', 't']);
    expect(a.calls.at(-1)).toEqual(['relayout', { 'xaxis.range': ['s', 't'] }]);
    link.dispose();
    a.emit('relayout', { 'xaxis.range[0]': 'x', 'xaxis.range[1]': 'y' });
    expect(b.calls.filter(([kind]) => kind === 'relayout')).toHaveLength(1);
  });
});
