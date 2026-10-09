import { describe, expect, it } from 'vitest';
import {
  adj,
  BASE,
  BASE_DATE,
  CALENDAR,
  CORE,
  dailyReturns,
  drawdowns,
  END,
  episodes,
  ETFS,
  EVENTS,
  growth,
  HOLDINGS,
  INDICATOR,
  LAST_DATE,
  maxDrawdown,
  MONTH_SPANS,
  monthlyReturns,
  OHLCV,
  PERIODS,
  QUARTER_SPANS,
  quarterlyReturns,
  resample,
  SECTORS,
  sectorWeights,
  SPLIT,
  SPLIT_DATE,
  stats,
  STOCKS,
  topShare,
  totalReturn,
  WINDOW,
  YEAR_SPANS,
  yearlyReturns,
} from '../../examples/demos/index-funds/analysis.mts';

const product = (r: readonly number[]): number => r.reduce((a, v) => a * (1 + v), 1) - 1;

describe('index funds demo data', () => {
  it('covers four years in two equal halves', () => {
    expect([BASE_DATE, SPLIT_DATE, LAST_DATE]).toEqual(['2022-09-30', '2024-09-30', '2026-09-30']);
    expect(SPLIT - BASE).toBe(501);
    expect(END - SPLIT).toBe(501);
    expect(PERIODS.first.to).toBe(PERIODS.second.from);
    expect(WINDOW).toHaveLength(1003);
    expect([...CALENDAR]).toEqual([...CALENDAR].sort());
  });

  it('has a positive price for every ticker on every session', () => {
    for (const t of [...ETFS, ...STOCKS]) {
      expect(adj(t)).toHaveLength(CALENDAR.length);
      expect(adj(t).every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
    for (const t of CORE) {
      const bars = OHLCV[t];
      expect(bars.close).toHaveLength(WINDOW.length);
      bars.close.forEach((close, i) => {
        expect(bars.high[i]).toBeGreaterThanOrEqual(Math.max(bars.open[i]!, close) - 1e-6);
        expect(bars.low[i]).toBeLessThanOrEqual(Math.min(bars.open[i]!, close) + 1e-6);
      });
    }
    for (const key of ['VIX', 'TNX', 'IRX'] as const) {
      expect(INDICATOR[key]).toHaveLength(WINDOW.length);
      expect(INDICATOR[key].every((v) => v > 0)).toBe(true);
    }
  });

  it('splits into 48 months, 16 quarters and 5 calendar years that tile the window', () => {
    expect(MONTH_SPANS).toHaveLength(48);
    expect(QUARTER_SPANS).toHaveLength(16);
    expect(YEAR_SPANS.map((y) => y.key)).toEqual(['2022', '2023', '2024', '2025', '2026']);
    for (const spans of [MONTH_SPANS, QUARTER_SPANS, YEAR_SPANS]) {
      expect(spans[0]!.from).toBe(BASE);
      expect(spans.at(-1)!.to).toBe(END);
      for (let i = 1; i < spans.length; i++) expect(spans[i]!.from).toBe(spans[i - 1]!.to);
    }
    expect(MONTH_SPANS.filter((m) => m.half === 'first')).toHaveLength(24);
    expect(QUARTER_SPANS.filter((q) => q.half === 'first')).toHaveLength(8);
    expect(MONTH_SPANS[23]!.to).toBe(SPLIT);
  });

  it('compounds the same total from days, months, quarters, years and halves', () => {
    for (const t of ETFS) {
      const total = totalReturn(t);
      expect(product(dailyReturns(t).r)).toBeCloseTo(total, 9);
      expect(product(monthlyReturns(t))).toBeCloseTo(total, 9);
      expect(product(quarterlyReturns(t))).toBeCloseTo(total, 9);
      expect(product(yearlyReturns(t))).toBeCloseTo(total, 9);
      expect(product([totalReturn(t, 'first'), totalReturn(t, 'second')])).toBeCloseTo(total, 9);
      expect(growth(t).value.at(-1)).toBeCloseTo(10_000 * (1 + total), 6);
      expect(dailyReturns(t, 'first').r).toHaveLength(501);
      expect(dailyReturns(t, 'second').r).toHaveLength(501);
    }
  });

  it('measures drawdowns consistently', () => {
    for (const t of CORE) {
      const { dd, dates } = drawdowns(t);
      expect(dates).toHaveLength(WINDOW.length);
      expect(dd.every((v) => v <= 0 && v > -1)).toBe(true);
      // The four years end at or after every fund's last recovery or inside its last episode.
      const list = episodes(t);
      expect(list.length).toBeGreaterThan(0);
      for (const e of list) {
        expect(e.depth).toBeLessThanOrEqual(-0.05);
        expect(e.peak < e.trough).toBe(true);
        if (e.recovery) expect(e.trough < e.recovery).toBe(true);
      }
      // A half's deepest fall from its own highs is never deeper than the deepest from any high.
      for (const half of ['first', 'second'] as const) {
        expect(maxDrawdown(t, half).depth).toBeGreaterThanOrEqual(Math.min(...dd) - 1e-12);
        expect(stats(t, half).maxDrawdown).toBe(maxDrawdown(t, half).depth);
      }
    }
    const spring = episodes('SPY').find((e) => e.trough === '2025-04-08');
    expect(spring).toMatchObject({ peak: '2025-02-19', recovery: '2025-06-26' });
  });

  it('resamples daily bars without losing volume or range', () => {
    for (const by of ['week', 'month'] as const) {
      const daily = OHLCV.SPY;
      const merged = resample(daily, by);
      const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);
      expect(sum(merged.volume)).toBe(sum(daily.volume.slice(1)));
      expect(Math.max(...merged.high)).toBe(Math.max(...daily.high.slice(1)));
      expect(Math.min(...merged.low)).toBe(Math.min(...daily.low.slice(1)));
      expect(merged.close.at(-1)).toBe(daily.close.at(-1));
    }
    expect(resample(OHLCV.SPY, 'month').date).toHaveLength(48);
  });

  it('assigns every S&P 500 holding to one sector and sums weights to 100', () => {
    const spy = HOLDINGS.SPY.holdings;
    expect(spy.length).toBeGreaterThan(495);
    expect(spy.every((h) => h.sector !== undefined && SECTORS.includes(h.sector))).toBe(true);
    expect(spy.reduce((a, h) => a + h.weight, 0)).toBeCloseTo(100, 1);
    expect(sectorWeights().reduce((a, s) => a + s.weight, 0)).toBeCloseTo(100, 1);
    expect(HOLDINGS.DIA.holdings).toHaveLength(30);
    expect(HOLDINGS.DIA.holdings.reduce((a, h) => a + h.weight, 0)).toBeCloseTo(100, 1);
    expect(topShare('SPY', 10)).toBeLessThan(topShare('DIA', 10));
    for (let i = 1; i < spy.length; i++) {
      expect(spy[i]!.weight).toBeLessThanOrEqual(spy[i - 1]!.weight);
    }
  });

  it('dates every event on a session of its half', () => {
    for (const e of EVENTS) {
      const i = CALENDAR.indexOf(e.date);
      expect(i).toBeGreaterThan(BASE);
      expect(i <= SPLIT ? 'first' : 'second').toBe(e.half);
    }
  });
});
