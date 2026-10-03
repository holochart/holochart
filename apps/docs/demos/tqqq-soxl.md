---
title: TQQQ and SOXL
description: Sixteen years of the two most traded 3× ETFs, charted with Holochart — prices, drawdowns, calendar returns, how daily leverage behaves, return distributions and what the funds hold.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  COMMON_RETURNS,
  COMMON_START,
  fmtDate,
  growthOf,
  headline,
  HOLDINGS,
  LAST_DATE,
  linreg,
  pct,
  usd,
} from '@mk7s/holochart-examples/demos/tqqq-soxl/analysis.mts';
import StatTiles from './components/StatTiles.vue';

const h = { TQQQ: headline('TQQQ'), SOXL: headline('SOXL'), QQQ: headline('QQQ'), SOXX: headline('SOXX') };
const end = (t) => growthOf(t).adj.at(-1);
const beta = {
  TQQQ: linreg(COMMON_RETURNS.QQQ.r, COMMON_RETURNS.TQQQ.r).m,
  SOXL: linreg(COMMON_RETURNS.SOXX.r, COMMON_RETURNS.SOXL.r).m,
};
const stats = [
  {
    value: usd(end('TQQQ')),
    label: `$10,000 in TQQQ on ${fmtDate(COMMON_START)}`,
    aside: `QQQ: ${usd(end('QQQ'))} · ${pct(h.TQQQ.cagr)}/yr vs ${pct(h.QQQ.cagr)}`,
  },
  {
    value: usd(end('SOXL')),
    label: `$10,000 in SOXL on ${fmtDate(COMMON_START)}`,
    aside: `SOXX: ${usd(end('SOXX'))} · ${pct(h.SOXL.cagr)}/yr vs ${pct(h.SOXX.cagr)}`,
  },
  {
    value: pct(h.SOXL.maxDrawdown, 1),
    label: 'SOXL’s deepest fall (2022)',
    aside: `TQQQ: ${pct(h.TQQQ.maxDrawdown, 1)} · QQQ: ${pct(h.QQQ.maxDrawdown, 1)}`,
  },
  {
    value: `${beta.TQQQ.toFixed(2)}×`,
    label: 'TQQQ’s daily move per 1% of QQQ',
    aside: `SOXL per SOXX: ${beta.SOXL.toFixed(2)}×`,
  },
];
</script>

<p class="hc-eyebrow">TQQQ · SOXL · daily data {{ fmtDate(COMMON_START) }} – {{ fmtDate(LAST_DATE) }}</p>

# Sixteen years of 3× leverage

<p class="hc-verdict">
  <strong>3× a day is not 3× a year.</strong> TQQQ and SOXL deliver almost exactly three times
  their index's move every single day. Compounded over 16 years that turned $10,000 into
  {{ usd(end('TQQQ')) }} and {{ usd(end('SOXL')) }}, about 17× and 6× what the unleveraged
  ETFs made. On the way TQQQ lost 82% and SOXL 90%, and in choppy years a fund can fall while
  its index rises.
</p>

<StatTiles :items="stats" />

ProShares UltraPro QQQ (**TQQQ**) and Direxion Daily Semiconductor Bull 3X (**SOXL**) are the
two biggest leveraged ETFs: each resets to 3× its index's daily return every day, the first on
the Nasdaq-100, the second on semiconductor stocks. This page charts them against the
unleveraged ETFs on the same indexes, **QQQ** and **SOXX**, using one hue per index family: the
3× fund solid, its reference dashed and lighter. Every chart is a Holochart example that runs
live in your browser and doubles as a visual regression test; together they use more than 25
chart types. Nothing here is investment advice.

## Where they are today

The last close, the year so far against the unleveraged index, where the price sits in its
52-week range, and how far below its all-time high each fund is.

<Example id="demos/tqqq-soxl/dashboard" bare :height="320" />

### Daily candles

Six months of daily candles with 20- and 50-day moving averages and volume. Weekends and market
holidays are removed from the date axis (range breaks), and the range slider below zooms the
window. SOXL more than sextupled from its April low to its June high, then gave half of it back.

<Example id="demos/tqqq-soxl/candles" bare :height="540" />

### The last five sessions

Five-minute OHLC bars, with nights and the weekend cut from the time axis, the volume-weighted
average price of each session, and the close before the first bar.

<Example id="demos/tqqq-soxl/intraday" bare :height="440" />

## The long run

$10,000 invested on SOXL's first day, with dividends reinvested. On the log axis equal heights
are equal percentage moves; switch to linear to see how much of the gain came in the last few
years.

<Example id="demos/tqqq-soxl/growth" bare :height="480" />

### Drawdowns

How far each fund was below its previous high on every day. QQQ never fell more than 35% and
SOXX not more than 46%. TQQQ fell more than half four times (deepest 82%, in 2022); SOXL fell
more than 60% seven times, including 90% in 2022 and 69% this summer.

<Example id="demos/tqqq-soxl/drawdowns" bare :height="440" />

### Calendar years

Three times the index in a good year is a lot more than three times: in 2023 QQQ rose 55% and
TQQQ 198%. In 2022 the index fell a third and the funds lost four fifths.

<Example id="demos/tqqq-soxl/annual-returns" bare :height="440" />

### Every month

Monthly returns since 2010, with the year in the last column. Switch between the funds; hover a
cell for the exact figure.

<Example id="demos/tqqq-soxl/monthly-heatmap" bare :height="560" />

The same months as 3D bars, years running into the screen. Drag to orbit: SOXL's April 2026
(+165%) towers over sixteen years of mostly ±30% months, three months before its worst (−57%).

<Example id="demos/tqqq-soxl/monthly-3d" bare :height="600" />

### Year by year

<Example id="demos/tqqq-soxl/year-table" bare :height="600" />

## How daily 3× works

Plot each day's fund return against its index's: the points sit on a line with slope
{{ beta.TQQQ.toFixed(2) }} (TQQQ) and {{ beta.SOXL.toFixed(2) }} (SOXL), just under 3 because of
fees, financing and, for SOXL, a proxy index.

<Example id="demos/tqqq-soxl/daily-leverage" bare :height="480" />

The same relation built with Holochart Express from a table of days, in one call with OLS
trendlines and marginal histograms. Coloring each day by how volatile the market was shows the
slope slipping as markets get rough: 3.005 on calm days, 2.988 on normal ones, 2.919 on volatile
ones, where SOXX's trailing volatility was above 40%.

<Example id="demos/tqqq-soxl/express-beta" bare :height="560" />

### Three times the risk

Volatility is three times the index's too: about 61% a year for TQQQ against 21% for QQQ, and
92% for SOXL against 31% for SOXX. SOXL's 63-day volatility peaked at 222% in May 2020.

<Example id="demos/tqqq-soxl/rolling-vol" bare :height="420" />

### Volatility decay

Because the leverage resets daily, a 3× fund's yearly return depends on the path, not just on
the index's yearly return. A simple model (no fees, no financing) gives
`(1 + R)³ · e^(−3σ²) − 1` for an index return `R` with volatility `σ`: in calm, trending years
the fund beats three times the index; in volatile, sideways years it falls well behind, and can
lose money while the index gains, as TQQQ did in 2011 (−8% while QQQ rose 3%) and SOXL in 2024
(−12% while SOXX rose 13%). The contours show the gap to "3× the index"; the dots are the
actual calendar years.

<Example id="demos/tqqq-soxl/decay-contour" bare :height="540" />

TQQQ beat three times QQQ in 6 of 15 full years (2023 by 33 points); SOXL beat three times
SOXX in 7, and fell 88 points short in 2020.

The model's full surface, fund return over index return and volatility, with the actual years
as points. Drag to orbit: the years sit on the surface, a median of about 4 points below it, the
cost of fees, financing and tracking.

<Example id="demos/tqqq-soxl/decay-surface" bare :height="600" />

### Risk and return, year by year

Each year as a bubble: volatility across, return up, size the year's deepest drawdown. Press
play to step through the years. Leverage triples the volatility but not the return: in 2025
TQQQ made 34% on 70% volatility against QQQ's 21% on 24%.

<Example id="demos/tqqq-soxl/risk-return" bare :height="540" />

Every year of both funds on parallel axes. Drag along an axis to filter: the calmer years tend
to be the better ones (correlation of volatility and return across full years: −0.4).

<Example id="demos/tqqq-soxl/parcoords" bare :height="440" />

## The shape of daily returns

Daily returns are not normally distributed. Switch the y axis to log to see the tails: each fund
had 8 days more than five standard deviations from its mean, moves a normal curve with the same
spread would expect about once in 7,000 years.

<Example id="demos/tqqq-soxl/returns-histogram" bare :height="440" />

Each year's daily returns, TQQQ on the left of each violin and SOXL on the right. 2017 was the
calmest year; 2020 and 2022 the wildest, when SOXL's daily standard deviation passed 8%.

<Example id="demos/tqqq-soxl/returns-violin" bare :height="460" />

Monthly returns of all four ETFs: leverage spreads the months about three times wider. TQQQ's
middle half of months runs from −6% to +15%, QQQ's from −2% to +5%.

<Example id="demos/tqqq-soxl/returns-box" bare :height="440" />

Daily returns of each pair of ETFs against each other, colored by year. Each fund is a near
perfect line against its own index; across the two index families the correlation is 0.86.

<div class="hc-demo-narrow">
  <Example id="demos/tqqq-soxl/splom" bare :height="640" />
</div>

### Seasonality and co-movement

The median return of each calendar month, with the 0% ring part-way out: bars grow outward for
gains and inward for losses. May has been the best month (SOXL's median +18%), September the
worst. Switch to the win rate to see how often each month closed up.

<div class="hc-demo-narrow">
  <Example id="demos/tqqq-soxl/seasonality-polar" bare :height="560" />
</div>

How often the two funds move together: every trading day by TQQQ's direction, SOXL's direction
and the size of SOXL's move. They closed the same way on 81% of days, and SOXL moved more than
5% on 1,262 of them, three days in ten.

<Example id="demos/tqqq-soxl/co-movement" bare :height="440" />

## What's inside

A 3× fund can't buy three times its assets in stock. It holds some stock and lots of cash and
Treasury bills, and gets the rest of its exposure from total return swaps with banks (and, for
TQQQ, index futures). Per $100 of net assets:

<Example id="demos/tqqq-soxl/exposure-waterfall" bare :height="440" />

The same exposure by instrument and counterparty. Swaps are 86% of TQQQ's exposure and 77% of
SOXL's; no bank holds more than 11% of TQQQ's, while Goldman Sachs and Barclays each carry 18%
of SOXL's.

<Example id="demos/tqqq-soxl/holdings-sunburst" bare :height="520" />

The same banks are on the other side of both funds: {{ usd(152.5e9) }} of swap notional in
total.

<Example id="demos/tqqq-soxl/counterparties-sankey" bare :height="520" />

What the funds actually own. Only a third of TQQQ's net assets is stock; most of the rest is
T-bills, a money-market fund and amounts owed under the swaps. SOXL holds 70% stock.

<Example id="demos/tqqq-soxl/holdings-icicle" bare :height="480" />

The stocks held outright, sized by market value and colored by weight in the fund. TQQQ holds
all of the Nasdaq-100; SOXL 30 chip stocks.

<Example id="demos/tqqq-soxl/holdings-treemap" bare :height="520" />

## Sources

<p class="hc-demo-source">
  Daily and intraday prices: Yahoo Finance, retrieved {{ fmtDate(LAST_DATE) }} after the close.
  Returns use split- and dividend-adjusted prices. Holdings: the issuers' daily holdings files,
  ProShares (TQQQ, {{ fmtDate(HOLDINGS.TQQQ.asOf) }}) and Direxion (SOXL,
  {{ fmtDate(HOLDINGS.SOXL.asOf) }}). SOXX stands in for SOXL's index, which it tracks closely
  but not exactly. Details:
  <a href="https://github.com/holochart/holochart/blob/main/examples/demos/tqqq-soxl/data/SOURCES.md" target="_blank" rel="noopener">SOURCES.md</a>.
  Chart sources: <a href="https://github.com/holochart/holochart/tree/main/examples/demos/tqqq-soxl" target="_blank" rel="noopener">examples/demos/tqqq-soxl</a>.
  This page is a charting demo, not investment advice.
</p>
