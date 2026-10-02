/**
 * Shared data and analysis for the Dallas weather demo (docs page `demos/dallas-weather`): the
 * daily record of Dallas Love Field since August 1939 (NOAA GHCN-Daily, see data/SOURCES.md) in
 * US units, and the summaries the charts draw from it (per-year figures, monthly normals, the
 * day-of-year climatology, and wind since 1997).
 *
 * Pure and DOM-free, so the docs page can import it during server-side rendering. A `.mts` file
 * on purpose: the example registry treats every `.ts` file under `examples/` as an example.
 */
import daily from './data/daily.json';

/** The file marks a missing reading with −9999, so its arrays stay purely numeric. */
const MISSING = -9999;
const column = (v: readonly number[]): (number | null)[] =>
  v.map((x) => (x === MISSING ? null : x));
const file = daily as {
  station: string;
  name: string;
  start: string;
  end: string;
  windStart: string;
  tmax: number[];
  tmin: number[];
  prcp: number[];
  snow: number[];
  awnd: number[];
  wdf2: number[];
  wsf2: number[];
  thunder: number[];
  fog: number[];
};
const raw = {
  ...file,
  tmax: column(file.tmax),
  tmin: column(file.tmin),
  prcp: column(file.prcp),
  snow: column(file.snow),
  awnd: column(file.awnd),
  wdf2: column(file.wdf2),
  wsf2: column(file.wsf2),
};

const DAY_MS = 86_400_000;
const T0 = Date.parse(raw.start);
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/* ---------------------------------------------------------------------------------------------- */
/* The daily record                                                                               */
/* ---------------------------------------------------------------------------------------------- */

export const STATION = raw.name;
/** First and last day of the record, `YYYY-MM-DD`. */
export const FIRST_DATE = raw.start;
export const LAST_DATE = raw.end;
/** Number of days in the record. */
export const N = raw.tmax.length;

/** ISO date of every day in the record. */
export const DATE: readonly string[] = Array.from({ length: N }, (_, i) =>
  new Date(T0 + i * DAY_MS).toISOString().slice(0, 10),
);
export const YEAR: readonly number[] = DATE.map((d) => Number(d.slice(0, 4)));
/** Month, 1–12. */
export const MONTH: readonly number[] = DATE.map((d) => Number(d.slice(5, 7)));
/** Day of the month, 1–31. */
export const DOM: readonly number[] = DATE.map((d) => Number(d.slice(8, 10)));

/**
 * Daily high and low, whole °F, as the station reads them (the record stores tenths of °C, so
 * rounding recovers the original reading). `null` where missing.
 */
const toF = (v: number | null): number | null =>
  v === null ? null : Math.round((v / 10) * 1.8 + 32) + 0;
export const TMAX: readonly (number | null)[] = raw.tmax.map(toF);
/**
 * A low at least 30 °F below the lows of both neighbouring days is a faulty reading (one day in
 * the record: 32 °F on Jun 24, 2025, between lows of 77 and 75 °F) and is treated as missing.
 */
export const TMIN: readonly (number | null)[] = raw.tmin.map(toF).map((v, i, all) => {
  const before = all[i - 1];
  const after = all[i + 1];
  const faulty =
    v !== null &&
    before !== null &&
    before !== undefined &&
    after !== null &&
    after !== undefined &&
    v <= before - 30 &&
    v <= after - 30;
  return faulty ? null : v;
});
/** Daily rain (and melted snow), inches (the record is in tenths of mm). */
export const PRCP: readonly (number | null)[] = raw.prcp.map((v) =>
  v === null ? null : round2(v / 254),
);
/** Daily snowfall, inches (the record is in mm). */
export const SNOW: readonly (number | null)[] = raw.snow.map((v) =>
  v === null ? null : round1(v / 25.4),
);
/** Days on which thunder was reported, as a lookup by day index. */
export const THUNDER: ReadonlySet<number> = new Set(raw.thunder);
export const FOG: ReadonlySet<number> = new Set(raw.fog);

/** Day index of an ISO date. */
export function dayIndex(date: string): number {
  return Math.round((Date.parse(date) - T0) / DAY_MS);
}

/**
 * Position in a 366-day calendar year, 0–365, with Feb 29 at 59 in every year, so the same
 * calendar day has the same slot in leap and common years.
 */
const MONTH_START = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
export function slot(i: number): number {
  return (MONTH_START[(MONTH[i] as number) - 1] as number) + (DOM[i] as number) - 1;
}
/** A date in the leap year 2000 for a slot, to put day-of-year data on a date axis. */
export function slotDate(s: number): string {
  return new Date(Date.UTC(2000, 0, 1) + s * DAY_MS).toISOString().slice(0, 10);
}

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/* ---------------------------------------------------------------------------------------------- */
/* Years                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

/** The complete calendar years of the record. */
export const FIRST_YEAR = 1940;
export const LAST_YEAR = Number(LAST_DATE.slice(0, 4)) - 1;
export const YEARS: readonly number[] = Array.from(
  { length: LAST_YEAR - FIRST_YEAR + 1 },
  (_, i) => FIRST_YEAR + i,
);
/** The year in progress (partial). */
export const CURRENT_YEAR = LAST_YEAR + 1;

/** Day indexes of a calendar year. */
export function daysOf(year: number): number[] {
  const out: number[] = [];
  const from = Math.max(0, dayIndex(`${year}-01-01`));
  for (let i = from; i < N && YEAR[i] === year; i++) out.push(i);
  return out;
}

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const present = (v: readonly (number | null)[], idx: readonly number[]): number[] =>
  idx.map((i) => v[i]).filter((x): x is number => x !== null && x !== undefined);

export interface YearSummary {
  year: number;
  /** Mean of the daily mean temperature ((high + low) / 2), °F. */
  meanTemp: number;
  meanHigh: number;
  meanLow: number;
  /** Hottest high and coldest low of the year, °F, with their dates. */
  hottest: number;
  hottestDate: string;
  coldest: number;
  coldestDate: string;
  /** Days with a high of 100 °F or more. */
  days100: number;
  /** Days with a high of 90 °F or more. */
  days90: number;
  /** Days with a low of 32 °F or less. */
  freezeDays: number;
  /** Total rain, inches, and the number of days with at least 0.01 in. */
  rain: number;
  rainDays: number;
  /** Days with rain data; `rain` of a year with fewer than 350 is incomplete. */
  rainObserved: number;
  /** Total snowfall, inches. */
  snow: number;
  thunderDays: number;
}

function summarize(year: number): YearSummary {
  const idx = daysOf(year);
  const both = idx.filter((i) => TMAX[i] !== null && TMIN[i] !== null);
  const highs = both.map((i) => TMAX[i] as number);
  const lows = both.map((i) => TMIN[i] as number);
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const rain = present(PRCP, idx);
  return {
    year,
    meanTemp: round1((mean(highs) + mean(lows)) / 2),
    meanHigh: round1(mean(highs)),
    meanLow: round1(mean(lows)),
    hottest: hi,
    hottestDate: DATE[both[highs.indexOf(hi)] as number] as string,
    coldest: lo,
    coldestDate: DATE[both[lows.indexOf(lo)] as number] as string,
    days100: highs.filter((t) => t >= 100).length,
    days90: highs.filter((t) => t >= 90).length,
    freezeDays: lows.filter((t) => t <= 32).length,
    rain: round2(rain.reduce((a, b) => a + b, 0)),
    rainDays: rain.filter((p) => p >= 0.01).length,
    rainObserved: rain.length,
    snow: round1(present(SNOW, idx).reduce((a, b) => a + b, 0)),
    thunderDays: idx.filter((i) => THUNDER.has(i)).length,
  };
}

/** One summary per complete year, 1940 to last year. */
export const YEARLY: readonly YearSummary[] = YEARS.map(summarize);
/** The year in progress, through `LAST_DATE`. */
export const THIS_YEAR: YearSummary = summarize(CURRENT_YEAR);
/** Years whose rain total is complete enough to compare (1997 and 1998 have gaps). */
export const RAIN_YEARS: readonly YearSummary[] = YEARLY.filter((y) => y.rainObserved >= 350);

export function yearSummary(year: number): YearSummary {
  const y = year === CURRENT_YEAR ? THIS_YEAR : YEARLY[year - FIRST_YEAR];
  if (!y) throw new Error(`No summary for ${year}.`);
  return y;
}

/* ---------------------------------------------------------------------------------------------- */
/* Months                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/** The climate-normal period the "typical" figures use. */
export const NORMAL_FROM = 1991;
export const NORMAL_TO = 2020;
const inNormals = (i: number): boolean =>
  (YEAR[i] as number) >= NORMAL_FROM && (YEAR[i] as number) <= NORMAL_TO;

export interface MonthNormal {
  /** 1–12. */
  month: number;
  name: string;
  /** Average daily high and low, °F. */
  high: number;
  low: number;
  /** Average total rain of the month, inches, and average number of rainy days. */
  rain: number;
  rainDays: number;
  /** Average number of days with thunder. */
  thunderDays: number;
}

/** Normal-period years with thunder reports (the station reported none in 1998). */
const THUNDER_NORMAL_YEARS = new Set([...THUNDER].filter(inNormals).map((i) => YEAR[i] as number))
  .size;

/** 1991–2020 averages for each calendar month. */
export const NORMALS: readonly MonthNormal[] = MONTH_NAMES.map((name, k) => {
  const idx: number[] = [];
  for (let i = 0; i < N; i++) if (MONTH[i] === k + 1 && inNormals(i)) idx.push(i);
  const years = NORMAL_TO - NORMAL_FROM + 1;
  const rain = present(PRCP, idx);
  // Scale by the share of days observed, so the 1997–98 gaps do not lower the monthly totals.
  const coverage = rain.length / idx.length;
  return {
    month: k + 1,
    name,
    high: round1(mean(present(TMAX, idx))),
    low: round1(mean(present(TMIN, idx))),
    rain: round2(rain.reduce((a, b) => a + b, 0) / years / coverage),
    rainDays: round1(rain.filter((p) => p >= 0.01).length / years / coverage),
    thunderDays: round1(idx.filter((i) => THUNDER.has(i)).length / THUNDER_NORMAL_YEARS),
  };
});

/**
 * Mean temperature ((high + low) / 2, °F) of every month of every year, `[year][month − 1]`,
 * for `FIRST_YEAR` through `CURRENT_YEAR`; `null` for months with fewer than 20 days of data.
 */
export const MONTHLY_MEAN: readonly (readonly (number | null)[])[] = (() => {
  const sum = new Map<number, { s: number; n: number }>();
  for (let i = 0; i < N; i++) {
    const hi = TMAX[i];
    const lo = TMIN[i];
    if (hi === null || lo === null || hi === undefined || lo === undefined) continue;
    const key = (YEAR[i] as number) * 12 + (MONTH[i] as number) - 1;
    const e = sum.get(key) ?? { s: 0, n: 0 };
    e.s += (hi + lo) / 2;
    e.n++;
    sum.set(key, e);
  }
  return [...YEARS, CURRENT_YEAR].map((y) =>
    MONTH_NAMES.map((_, k) => {
      const e = sum.get(y * 12 + k);
      return e && e.n >= 20 ? round1(e.s / e.n) : null;
    }),
  );
})();

/** Total rain (inches) of every month of every year, same shape as `MONTHLY_MEAN`. */
export const MONTHLY_RAIN: readonly (readonly (number | null)[])[] = (() => {
  const sum = new Map<number, { s: number; n: number }>();
  for (let i = 0; i < N; i++) {
    const p = PRCP[i];
    if (p === null || p === undefined) continue;
    const key = (YEAR[i] as number) * 12 + (MONTH[i] as number) - 1;
    const e = sum.get(key) ?? { s: 0, n: 0 };
    e.s += p;
    e.n++;
    sum.set(key, e);
  }
  return [...YEARS, CURRENT_YEAR].map((y) =>
    MONTH_NAMES.map((_, k) => {
      const e = sum.get(y * 12 + k);
      return e && e.n >= 27 ? round2(e.s) : null;
    }),
  );
})();

/* ---------------------------------------------------------------------------------------------- */
/* The calendar year, day by day                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export interface DayClimate {
  /** Slot 0–365 (Feb 29 = 59) and its date in the year 2000, for a date axis. */
  slot: number;
  date: string;
  /** 1991–2020 average high and low, °F. */
  avgHigh: number;
  avgLow: number;
  /** Highest high and lowest low on this calendar day in the whole record, with their years. */
  recordHigh: number;
  recordHighYear: number;
  recordLow: number;
  recordLowYear: number;
}

/** Averages and records for each of the 366 calendar days. */
export const CLIMATE: readonly DayClimate[] = (() => {
  const by: number[][] = Array.from({ length: 366 }, () => []);
  for (let i = 0; i < N; i++) by[slot(i)]?.push(i);
  return by.map((idx, s) => {
    const normal = idx.filter(inNormals);
    const hi = idx.filter((i) => TMAX[i] !== null);
    const lo = idx.filter((i) => TMIN[i] !== null);
    const top = hi.reduce((a, b) => ((TMAX[b] as number) > (TMAX[a] as number) ? b : a));
    const bottom = lo.reduce((a, b) => ((TMIN[b] as number) < (TMIN[a] as number) ? b : a));
    return {
      slot: s,
      date: slotDate(s),
      avgHigh: round1(mean(present(TMAX, normal))),
      avgLow: round1(mean(present(TMIN, normal))),
      recordHigh: TMAX[top] as number,
      recordHighYear: YEAR[top] as number,
      recordLow: TMIN[bottom] as number,
      recordLowYear: YEAR[bottom] as number,
    };
  });
})();

/* ---------------------------------------------------------------------------------------------- */
/* Wind (since April 1997)                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export const WIND_FIRST_DATE = raw.windStart;
const W0 = dayIndex(raw.windStart);

export interface WindDay {
  /** Day index into the daily record. */
  i: number;
  /** Average wind speed of the day, mph (the record is in tenths of m/s). */
  speed: number;
  /** Direction the fastest 2-minute wind came from, degrees clockwise from north. */
  direction: number;
  /** Speed of that fastest 2-minute wind, mph. */
  fastest: number;
}

const MPH = 2.23694;
/** Days with all three wind readings. */
export const WIND: readonly WindDay[] = raw.awnd.flatMap((v, k) => {
  const dir = raw.wdf2[k];
  const fast = raw.wsf2[k];
  if (v === null || dir === null || dir === undefined || fast === null || fast === undefined) {
    return [];
  }
  return [
    {
      i: W0 + k,
      speed: round1((v / 10) * MPH),
      direction: dir === 360 ? 0 : dir,
      fastest: round1((fast / 10) * MPH),
    },
  ];
});

/** The 16 compass points, clockwise from north. */
export const COMPASS = [
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
/** Index 0–15 of the compass point a direction in degrees falls in. */
export function compassIndex(degrees: number): number {
  return Math.round(degrees / 22.5) % 16;
}

/* ---------------------------------------------------------------------------------------------- */
/* Seasons, colors, formatting                                                                    */
/* ---------------------------------------------------------------------------------------------- */

export type Season = 'Winter' | 'Spring' | 'Summer' | 'Fall';
export const SEASONS: readonly Season[] = ['Winter', 'Spring', 'Summer', 'Fall'];
/** Meteorological season of a month (1–12): winter is Dec–Feb. */
export function seasonOf(month: number): Season {
  return SEASONS[Math.floor((month % 12) / 3)] as Season;
}

export const SEASON_COLOR: Readonly<Record<Season, string>> = {
  Winter: '#5e74d5',
  Spring: '#3fae4f',
  Summer: '#ea2a37',
  Fall: '#e8833a',
};

/** Semantic colors on the dark template. */
export const HOT = '#ea2a37';
export const WARM = '#e8833a';
export const COLD = '#5e74d5';
export const RAIN = '#3aa0c8';
export const SNOW_COLOR = '#c9d3f2';
export const NEUTRAL = '#8a90a6';

/**
 * A diverging temperature colorscale (cold blue, mild pale, hot red), for values in °F or for
 * differences from normal.
 */
export const TEMP_SCALE: [number, string][] = [
  [0, '#2b3f9e'],
  [0.25, '#5e74d5'],
  [0.5, '#e9e4d8'],
  [0.75, '#e8833a'],
  [1, '#b3121f'],
];

/** `2011-08-02` → `Aug 2, 2011`. */
export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}
/** `104` → `104 °F`. */
export function degF(v: number, digits = 0): string {
  return `${v.toFixed(digits)} °F`;
}
/** `36.14` → `36.1 in`. */
export function inches(v: number, digits = 1): string {
  return `${v.toFixed(digits)} in`;
}

/** Least-squares line `y = m·x + b`. */
export function linreg(x: readonly number[], y: readonly number[]): { m: number; b: number } {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += ((x[i] as number) - mx) * ((y[i] as number) - my);
    sxx += ((x[i] as number) - mx) ** 2;
  }
  const m = sxy / sxx;
  return { m, b: my - m * mx };
}
