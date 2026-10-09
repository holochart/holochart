/**
 * A synthetic Open-Meteo payload for the live weather demo's tests: three days of hourly values
 * with a daily cycle, built in code so the tests need no network and no stored snapshot.
 */
import {
  parseForecast,
  type Forecast,
  type Place,
} from '../../examples/demos/live-weather/data.mts';

const PLACE: Place = {
  zip: '75201',
  name: 'Dallas',
  state: 'TX',
  latitude: 32.7904,
  longitude: -96.8044,
};

const DATES = ['2026-10-03', '2026-10-04', '2026-10-05'];
const pad = (n: number): string => String(n).padStart(2, '0');

export function samplePayload() {
  const time = DATES.flatMap((date) =>
    Array.from({ length: 24 }, (_, hour) => `${date}T${pad(hour)}:00`),
  );
  // Warmest at 15:00, coolest at 03:00.
  const cycle = time.map((_, i) => Math.cos(((i % 24) - 15) * (Math.PI / 12)));
  const hourOf = (i: number): number => i % 24;
  return {
    latitude: 32.78,
    longitude: -96.8,
    timezone: 'America/Chicago',
    utc_offset_seconds: -18000,
    current: {
      time: '2026-10-03T14:15',
      temperature_2m: 79.5,
      apparent_temperature: 82,
      relative_humidity_2m: 60,
      dew_point_2m: 64,
      weather_code: 2,
      is_day: 1,
      wind_speed_10m: 8,
      wind_gusts_10m: 15,
      wind_direction_10m: 200,
      pressure_msl: 1013.25,
      cloud_cover: 40,
    },
    hourly: {
      time,
      temperature_2m: cycle.map((c) => 70 + 10 * c),
      apparent_temperature: cycle.map((c) => 71 + 12 * c),
      dew_point_2m: cycle.map((c) => 60 + 2 * c),
      relative_humidity_2m: cycle.map((c) => 65 - 25 * c),
      // Rain on the first morning only: 0.1 in an hour from 06:00 to 09:00.
      precipitation_probability: time.map((_, i) => (i >= 4 && i < 12 ? 80 : 5)),
      precipitation: time.map((_, i) => (i >= 6 && i < 10 ? 0.1 : 0)),
      snowfall: time.map(() => 0),
      cloud_cover: time.map((_, i) => (i < 14 ? 100 : 20)),
      pressure_msl: time.map((_, i) => 1013.25 + i * 0.05),
      wind_speed_10m: time.map((_, i) => 4 + (hourOf(i) % 6)),
      wind_gusts_10m: time.map((_, i) => 9 + (hourOf(i) % 6) * 2),
      // South through the first day, north-west afterwards.
      wind_direction_10m: time.map((_, i) => (i < 24 ? 180 : 315)),
      uv_index: time.map((_, i) => (hourOf(i) >= 8 && hourOf(i) <= 17 ? 5 : 0)),
    },
    daily: {
      time: DATES,
      weather_code: [61, 1, 0],
      temperature_2m_max: [80, 80, 80],
      temperature_2m_min: [60, 60, 60],
      precipitation_sum: [0.4, 0, 0],
      precipitation_probability_max: [80, 5, 5],
      snowfall_sum: [0, 0, 0],
      sunrise: DATES.map((d) => `${d}T07:22`),
      sunset: DATES.map((d) => `${d}T19:08`),
      wind_speed_10m_max: [9, 9, 9],
      wind_gusts_10m_max: [19, 19, 19],
      uv_index_max: [5, 5, 5],
    },
  };
}

export function sampleForecast(): Forecast {
  return parseForecast(PLACE, samplePayload());
}
