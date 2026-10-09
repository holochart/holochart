/**
 * The headline figures above the charts of the zip-code weather demo, worked out from the forecast
 * the page just fetched.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { dayLabel } from './charts.mts';
import { compass, describeCode, type Forecast } from './data.mts';

export interface Stat {
  value: string;
  label: string;
  aside?: string;
}

const deg = (v: number | null): string => (v === null ? '–' : `${Math.round(v)}°`);

/** `7:22 AM` for `2026-10-03T07:22`. */
export function clock(time: string | null): string {
  if (time === null) return '–';
  const hour = Number(time.slice(11, 13));
  return `${hour % 12 === 0 ? 12 : hour % 12}:${time.slice(14, 16)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** The day with the most precipitation, if any day has a measurable amount. */
export function wettestDay(f: Forecast): { date: string; precip: number } | null {
  let best: { date: string; precip: number } | null = null;
  for (const d of f.days) {
    if (d.precip !== null && d.precip >= 0.01 && (best === null || d.precip > best.precip)) {
      best = { date: d.date, precip: d.precip };
    }
  }
  return best;
}

export function headline(f: Forecast): Stat[] {
  const { current, days } = f;
  const today = days[0];
  const total = days.reduce((sum, d) => sum + (d.precip ?? 0), 0);
  const wettest = wettestDay(f);
  const wind = current.windSpeed === null ? '–' : `${Math.round(current.windSpeed)} mph`;
  const from = current.windDirection === null ? '' : ` from the ${compass(current.windDirection)}`;
  return [
    {
      value: current.temperature === null ? '–' : `${Math.round(current.temperature)} °F`,
      label: `${describeCode(current.code).label.toLowerCase()} at ${clock(current.time)}`,
      aside: `feels like ${deg(current.feelsLike)} · dew point ${deg(current.dewPoint)}`,
    },
    {
      value: `${deg(today?.high ?? null)} / ${deg(today?.low ?? null)}`,
      label: 'high and low today',
      aside: `sunrise ${clock(today?.sunrise ?? null)} · sunset ${clock(today?.sunset ?? null)}`,
    },
    {
      value: `${total.toFixed(2)} in`,
      label: `of precipitation in ${days.length} days`,
      aside: wettest
        ? `most on ${dayLabel(wettest.date)}: ${wettest.precip.toFixed(2)} in`
        : 'no day with a measurable amount',
    },
    {
      value: wind,
      label: `wind${from}`,
      aside:
        `gusts ${current.windGust === null ? '–' : `${Math.round(current.windGust)} mph`}` +
        ` · ${current.pressure === null ? '–' : `${current.pressure.toFixed(2)} inHg`}`,
    },
  ];
}
