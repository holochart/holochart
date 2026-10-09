/**
 * Live data for the zip-code weather demo. Nothing is bundled: the reader's browser turns a US zip
 * code into coordinates (Zippopotam.us) and asks Open-Meteo for the hourly forecast there, in °F,
 * mph and inches and in the place's own time zone. Both services are keyless and send CORS headers.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */

/** Days of forecast requested, counting today. */
export const FORECAST_DAYS = 10;

const HPA_TO_INHG = 0.0295299830714;

export type WeatherErrorKind = 'zip' | 'not-found' | 'network' | 'data';

/** A failure the page can explain: a malformed zip, an unknown one, the network, or the payload. */
export class WeatherError extends Error {
  readonly kind: WeatherErrorKind;
  constructor(kind: WeatherErrorKind, message: string) {
    super(message);
    this.name = 'WeatherError';
    this.kind = kind;
  }
}

export interface Place {
  zip: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
}

/** One value per hour; `time` is local wall-clock time, `YYYY-MM-DDTHH:MM`. */
export interface Hourly {
  time: string[];
  temperature: (number | null)[];
  feelsLike: (number | null)[];
  dewPoint: (number | null)[];
  humidity: (number | null)[];
  precipChance: (number | null)[];
  /** Liquid-equivalent precipitation in the hour, inches. */
  precip: (number | null)[];
  /** Snowfall in the hour, inches. */
  snowfall: (number | null)[];
  cloudCover: (number | null)[];
  /** Sea-level pressure, inches of mercury. */
  pressure: (number | null)[];
  windSpeed: (number | null)[];
  windGust: (number | null)[];
  /** Direction the wind blows from, degrees clockwise from north. */
  windDirection: (number | null)[];
  uvIndex: (number | null)[];
}

export interface Day {
  /** `YYYY-MM-DD`. */
  date: string;
  /** WMO weather code for the day. */
  code: number;
  high: number | null;
  low: number | null;
  precip: number | null;
  precipChance: number | null;
  snowfall: number | null;
  /** Local wall-clock time, `YYYY-MM-DDTHH:MM`. */
  sunrise: string | null;
  sunset: string | null;
  windMax: number | null;
  gustMax: number | null;
  uvMax: number | null;
}

export interface Current {
  /** Local wall-clock time of the reading, `YYYY-MM-DDTHH:MM`. */
  time: string;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  dewPoint: number | null;
  code: number;
  isDay: boolean;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  /** Sea-level pressure, inches of mercury. */
  pressure: number | null;
  cloudCover: number | null;
}

export interface Forecast {
  place: Place;
  /** IANA name, e.g. `America/Chicago`. */
  timezone: string;
  current: Current;
  hourly: Hourly;
  days: Day[];
}

/** `fetch`, narrowed to what this module uses, so tests can pass a stub. */
export type Fetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The five digits of a US zip code (a ZIP+4 suffix is dropped), or a `zip` error. */
export function normalizeZip(input: string): string {
  const match = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(input);
  if (!match) throw new WeatherError('zip', 'Enter a five-digit US zip code.');
  return match[1] as string;
}

export function zipUrl(zip: string): string {
  return `https://api.zippopotam.us/us/${zip}`;
}

const HOURLY_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'dew_point_2m',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'snowfall',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'uv_index',
];
const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'snowfall_sum',
  'sunrise',
  'sunset',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'uv_index_max',
];
const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'weather_code',
  'is_day',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'pressure_msl',
  'cloud_cover',
];

export function forecastUrl(place: Pick<Place, 'latitude' | 'longitude'>): string {
  const query = new URLSearchParams({
    latitude: place.latitude.toFixed(4),
    longitude: place.longitude.toFixed(4),
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    forecast_days: String(FORECAST_DAYS),
    current: CURRENT_VARS.join(','),
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
  });
  return `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const inHg = (hPa: number | null): number | null => (hPa === null ? null : hPa * HPA_TO_INHG);

/** How long to wait before asking again after a server error, ms. */
const RETRY_AFTER_MS = 300;

/** One request; a server error (HTTP 5xx, which both services return in passing) is tried once more. */
async function request(url: string, fetchFn: Fetch, signal: AbortSignal | undefined) {
  const once = async () => {
    try {
      return await fetchFn(url, signal ? { signal } : undefined);
    } catch (error) {
      if (isObject(error) && error['name'] === 'AbortError') throw error;
      throw new WeatherError(
        'network',
        'Could not reach the weather service. Check the connection.',
      );
    }
  };
  const first = await once();
  if (first.status < 500 || signal?.aborted) return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
  return once();
}

/** Zip code → place, from Zippopotam.us. An unknown zip is a `not-found` error. */
export async function lookupZip(
  input: string,
  fetchFn: Fetch = fetch,
  signal?: AbortSignal,
): Promise<Place> {
  const zip = normalizeZip(input);
  const response = await request(zipUrl(zip), fetchFn, signal);
  if (response.status === 404) {
    throw new WeatherError('not-found', `No US zip code ${zip} was found.`);
  }
  if (!response.ok) {
    throw new WeatherError('network', `The zip lookup failed (HTTP ${response.status}).`);
  }
  return parsePlace(zip, await response.json());
}

export function parsePlace(zip: string, raw: unknown): Place {
  const place = isObject(raw) && Array.isArray(raw['places']) ? raw['places'][0] : undefined;
  const latitude = isObject(place) ? Number(place['latitude']) : NaN;
  const longitude = isObject(place) ? Number(place['longitude']) : NaN;
  if (!isObject(place) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new WeatherError('not-found', `No US zip code ${zip} was found.`);
  }
  return {
    zip,
    name: str(place['place name']) ?? zip,
    state: str(place['state abbreviation']) ?? '',
    latitude,
    longitude,
  };
}

/** The hourly forecast at a place, from Open-Meteo. */
export async function fetchForecast(
  place: Place,
  fetchFn: Fetch = fetch,
  signal?: AbortSignal,
): Promise<Forecast> {
  const response = await request(forecastUrl(place), fetchFn, signal);
  if (!response.ok) {
    throw new WeatherError('network', `The forecast request failed (HTTP ${response.status}).`);
  }
  return parseForecast(place, await response.json());
}

/** Zip code → forecast: the two requests the page makes. */
export async function loadWeather(
  input: string,
  fetchFn: Fetch = fetch,
  signal?: AbortSignal,
): Promise<Forecast> {
  return fetchForecast(await lookupZip(input, fetchFn, signal), fetchFn, signal);
}

/** Checks an Open-Meteo response and reshapes it; a payload without hourly data is a `data` error. */
export function parseForecast(place: Place, raw: unknown): Forecast {
  const bad = new WeatherError(
    'data',
    'The weather service sent a forecast this page cannot read.',
  );
  if (!isObject(raw) || !isObject(raw['hourly']) || !isObject(raw['daily'])) throw bad;
  const hourly = raw['hourly'];
  const daily = raw['daily'];
  const current = isObject(raw['current']) ? raw['current'] : {};
  const time = Array.isArray(hourly['time']) ? hourly['time'].map(String) : [];
  const dates = Array.isArray(daily['time']) ? daily['time'].map(String) : [];
  if (time.length === 0 || dates.length === 0) throw bad;

  const series = (from: Json, key: string, length: number): (number | null)[] => {
    const values = Array.isArray(from[key]) ? (from[key] as unknown[]) : [];
    return Array.from({ length }, (_, i) => num(values[i]));
  };
  const texts = (key: string): (string | null)[] => {
    const values = Array.isArray(daily[key]) ? (daily[key] as unknown[]) : [];
    return dates.map((_, i) => str(values[i]));
  };
  const h = (key: string) => series(hourly, key, time.length);
  const d = (key: string) => series(daily, key, dates.length);

  const code = d('weather_code');
  const high = d('temperature_2m_max');
  const low = d('temperature_2m_min');
  const precip = d('precipitation_sum');
  const precipChance = d('precipitation_probability_max');
  const snowfall = d('snowfall_sum');
  const windMax = d('wind_speed_10m_max');
  const gustMax = d('wind_gusts_10m_max');
  const uvMax = d('uv_index_max');
  const sunrise = texts('sunrise');
  const sunset = texts('sunset');

  return {
    place,
    timezone: str(raw['timezone']) ?? 'UTC',
    current: {
      time: str(current['time']) ?? (time[0] as string),
      temperature: num(current['temperature_2m']),
      feelsLike: num(current['apparent_temperature']),
      humidity: num(current['relative_humidity_2m']),
      dewPoint: num(current['dew_point_2m']),
      code: num(current['weather_code']) ?? 0,
      isDay: current['is_day'] !== 0,
      windSpeed: num(current['wind_speed_10m']),
      windGust: num(current['wind_gusts_10m']),
      windDirection: num(current['wind_direction_10m']),
      pressure: inHg(num(current['pressure_msl'])),
      cloudCover: num(current['cloud_cover']),
    },
    hourly: {
      time,
      temperature: h('temperature_2m'),
      feelsLike: h('apparent_temperature'),
      dewPoint: h('dew_point_2m'),
      humidity: h('relative_humidity_2m'),
      precipChance: h('precipitation_probability'),
      precip: h('precipitation'),
      snowfall: h('snowfall'),
      cloudCover: h('cloud_cover'),
      pressure: h('pressure_msl').map(inHg),
      windSpeed: h('wind_speed_10m'),
      windGust: h('wind_gusts_10m'),
      windDirection: h('wind_direction_10m'),
      uvIndex: h('uv_index'),
    },
    days: dates.map((date, i) => ({
      date,
      code: code[i] ?? 0,
      high: high[i] ?? null,
      low: low[i] ?? null,
      precip: precip[i] ?? null,
      precipChance: precipChance[i] ?? null,
      snowfall: snowfall[i] ?? null,
      sunrise: sunrise[i] ?? null,
      sunset: sunset[i] ?? null,
      windMax: windMax[i] ?? null,
      gustMax: gustMax[i] ?? null,
      uvMax: uvMax[i] ?? null,
    })),
  };
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** What a WMO weather code (the `weather_code` Open-Meteo reports) means, and which icon fits. */
export function describeCode(code: number): { label: string; sky: Sky } {
  if (code === 0) return { label: 'Clear', sky: 'clear' };
  if (code === 1) return { label: 'Mostly clear', sky: 'clear' };
  if (code === 2) return { label: 'Partly cloudy', sky: 'partly' };
  if (code === 3) return { label: 'Overcast', sky: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Fog', sky: 'fog' };
  if (code >= 51 && code <= 55) return { label: 'Drizzle', sky: 'drizzle' };
  if (code === 56 || code === 57) return { label: 'Freezing drizzle', sky: 'drizzle' };
  if (code === 61) return { label: 'Light rain', sky: 'rain' };
  if (code === 63) return { label: 'Rain', sky: 'rain' };
  if (code === 65) return { label: 'Heavy rain', sky: 'rain' };
  if (code === 66 || code === 67) return { label: 'Freezing rain', sky: 'rain' };
  if (code === 71) return { label: 'Light snow', sky: 'snow' };
  if (code === 73) return { label: 'Snow', sky: 'snow' };
  if (code === 75) return { label: 'Heavy snow', sky: 'snow' };
  if (code === 77) return { label: 'Snow grains', sky: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Showers', sky: 'rain' };
  if (code === 85 || code === 86) return { label: 'Snow showers', sky: 'snow' };
  if (code === 95) return { label: 'Thunderstorms', sky: 'storm' };
  if (code === 96 || code === 99) return { label: 'Thunderstorms, hail', sky: 'storm' };
  return { label: 'Unsettled', sky: 'cloudy' };
}

const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

/** Degrees clockwise from north → one of 16 compass points. */
export function compass(degrees: number): (typeof COMPASS)[number] {
  return COMPASS[
    (((Math.round(degrees / 22.5) % 16) + 16) % 16) as number
  ] as (typeof COMPASS)[number];
}
