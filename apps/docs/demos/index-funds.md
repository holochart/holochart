---
title: Index funds, 2022–2026
description: Four years of the main US index funds in 48 Holochart charts — SPY, QQQ, DIA, IWM and VTI from October 2022 to September 2026, split into two halves and compared.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  BASE_DATE,
  beta,
  correlation,
  fmtDate,
  growth,
  HOLDINGS,
  LAST_DATE,
  maxDrawdown,
  pct,
  RETRIEVED,
  share,
  SPLIT_DATE,
  stats,
  topShare,
  usd,
} from '@mk7s/holochart-examples/demos/index-funds/analysis.mts';
import StatTiles from './components/StatTiles.vue';

const end = (t) => usd(growth(t).value.at(-1));
const s = (t) => ({ first: stats(t, 'first'), second: stats(t, 'second'), all: stats(t, 'all') });
const spy = s('SPY');
const qqq = s('QQQ');
const dia = s('DIA');
const iwm = s('IWM');
const fall = maxDrawdown('SPY', 'second');
const tiles = [
  {
    value: end('SPY'),
    label: `$10,000 in SPY on ${fmtDate(BASE_DATE)}, four years on`,
    aside: `QQQ ${end('QQQ')} · DIA ${end('DIA')} · IWM ${end('IWM')}`,
  },
  {
    value: `${pct(spy.first.totalReturn)} → ${pct(spy.second.totalReturn)}`,
    label: 'SPY, first two years then second two',
    aside: `${pct(spy.first.cagr, 1)} a year, then ${pct(spy.second.cagr, 1)}`,
  },
  {
    value: pct(fall.depth, 1),
    label: `SPY’s deepest fall, ${fmtDate(fall.peak)} – ${fmtDate(fall.trough)}`,
    aside: `Deepest in the first half: ${pct(spy.first.maxDrawdown, 1)}`,
  },
  {
    value: pct(spy.second.best.r, 1),
    label: `SPY’s best day, ${fmtDate(spy.second.best.date)}`,
    aside: `Worst: ${pct(spy.second.worst.r, 1)}, ${fmtDate(spy.second.worst.date)}`,
  },
];
</script>

<p class="hc-eyebrow">SPY · QQQ · DIA · IWM · VTI · daily data {{ fmtDate(BASE_DATE) }} – {{ fmtDate(LAST_DATE) }}</p>

# Four years of index funds, in two halves

<p class="hc-verdict">
  <strong>One bull market, two different rides.</strong> $10,000 in the S&amp;P 500 at the end of
  September 2022 was {{ end('SPY') }} four years later. The first two years made
  {{ pct(spy.first.totalReturn) }} and never fell more than {{ share(-spy.first.maxDrawdown) }}
  from a high. The second two made {{ pct(spy.second.totalReturn) }}, and lost
  {{ share(-fall.depth) }} in seven weeks of 2025 on the way.
</p>

<StatTiles :items="tiles" />

Five funds stand in for the US stock market here. **SPY** tracks the S&P 500, **QQQ** the
Nasdaq-100, **DIA** the 30 stocks of the Dow, **IWM** the small companies of the Russell 2000,
and **VTI** the whole market. The four years run from the close of {{ fmtDate(BASE_DATE) }} to
the close of {{ fmtDate(LAST_DATE) }} and split at {{ fmtDate(SPLIT_DATE) }} into two halves of
501 trading days each: **2022–24** is always teal and **2024–26** always amber. Every chart is a
Holochart example that runs live in your browser: hover for values, drag to zoom, click a legend
entry to hide a series, drag the 3D charts to orbit. Returns include reinvested dividends.
Nothing here is investment advice.

[The two halves](#the-two-halves) · [The falls](#the-falls) · [Month by month](#month-by-month) ·
[Day by day](#day-by-day) · [Risk and return](#risk-and-return) · [Who led](#who-led) ·
[What's inside](#what-s-inside-the-s-p-500)

## Where they stand

The last close of each fund, its price change since the split two years earlier, and its total
return over the four years.

<Example id="demos/index-funds/dashboard" bare :height="320" />

## The two halves

$10,000 in each fund, dividends reinvested. QQQ ended at {{ end('QQQ') }}, SPY at
{{ end('SPY') }}, DIA at {{ end('DIA') }} and IWM at {{ end('IWM') }}. VTI, which holds the whole
market, ends about 2% behind SPY. Switch to the log axis, where equal heights are equal
percentage moves: the lines are steeper on the left.

<Example id="demos/index-funds/growth" bare :height="480" />

Each half restarted at $10,000 and laid over the other, by trading day. Pick a fund. SPY's first half never closed more than 0.2% below its start and ended at $16,537. Its second half was down to
$8,708 on its 130th day (April 8, 2025) and ended at $13,599.

<Example id="demos/index-funds/halves-rebased" bare :height="460" />

Every fund made less in the second half than in the first. SPY went from
{{ pct(spy.first.cagr, 1) }} a year to {{ pct(spy.second.cagr, 1) }}, QQQ from
{{ pct(qqq.first.cagr, 1) }} to {{ pct(qqq.second.cagr, 1) }}, DIA from
{{ pct(dia.first.cagr, 1) }} to {{ pct(dia.second.cagr, 1) }}, and IWM from
{{ pct(iwm.first.cagr, 1) }} to {{ pct(iwm.second.cagr, 1) }}.

<Example id="demos/index-funds/halves-returns" bare :height="440" />

The same $10,000 quarter by quarter, as a waterfall. Thirteen of SPY's sixteen quarters were
gains; the three losses were the third quarter of 2023 and the first quarters of 2025 and 2026.
QQQ and IWM gained more dollars in the second half than in the first despite the lower
percentage, because they started it with more.

<Example id="demos/index-funds/growth-waterfall" bare :height="460" />

### Weekly candles

Each candle is one week, with 10- and 40-week moving averages and volume below. SPY's worst week
was the week of March 31, 2025 (−9.1%) and its busiest the week after, with 924 million shares
traded. Use the buttons or the slider to zoom.

<Example id="demos/index-funds/candles" bare :height="540" />

### Monthly bars

One OHLC bar per month for each of the four funds: the tick on the left is the month's open, the
tick on the right its close. SPY and DIA closed 34 of 48 months above their open, QQQ 33 and
IWM 28.

<Example id="demos/index-funds/ohlc-monthly" bare :height="520" />

## The falls

How far each fund closed below its previous high. The four years begin in the 2022 bear market,
with SPY 24% under its January 2022 high; SPY and QQQ took until December 13, 2023 to get back,
and IWM until November 6, 2024. The second half's deepest fall came in spring 2025: SPY lost
{{ share(-fall.depth, 1) }} between {{ fmtDate(fall.peak) }} and {{ fmtDate(fall.trough) }} and
closed at a new high on June 26.

<Example id="demos/index-funds/drawdowns" bare :height="460" />

Every fall of 5% or more, from the high before it to the day the fund closed above that high
again, colored by depth. The diamond marks the low. IWM's fall from its November 2021 high took 753 trading days to recover.

<Example id="demos/index-funds/drawdown-episodes" bare :height="420" />

### Volatility

The VIX is the market's price for the S&P 500's volatility over the next month. It averaged 17.2
in the first half and 18.5 in the second. Its highest close of the four years was 52.3 on
April 8, 2025; in the first half it never closed above 38.6.

<Example id="demos/index-funds/vix" bare :height="440" />

What the funds delivered over the trailing 63 trading days. Over the four years QQQ and IWM were
about a third more volatile than SPY, and the Dow a little less. Switch to 21 days to see the
April 2025 spike at full height.

<Example id="demos/index-funds/rolling-vol" bare :height="420" />

## Month by month

Each cell is one month of one fund. SPY rose in 18 of the first 24 months and 15 of the second 24. All nine funds fell together in nine months, among them March 2025 and March 2026.

<Example id="demos/index-funds/monthly-heatmap" bare :height="460" />

The same months for the four funds as 3D bars. Drag to orbit: QQQ's April 2026 (+15.7%) is the
tallest bar and its December 2022 (−9.0%) the deepest.

<Example id="demos/index-funds/monthly-3d" bare :height="560" />

### Quarters and years

All four funds rose in 10 of the 16 quarters, five in each half, and all four fell in two: the
third quarter of 2023 and the first of 2025. The best quarter was the second of 2026, when QQQ
made 27.7%.

<Example id="demos/index-funds/quarterly-returns" bare :height="460" />

By calendar year. The Dow made between +14.7% and +16.0% in each of 2023, 2024 and 2025; QQQ's years run from +54.9% in 2023 to +20.8%.

<Example id="demos/index-funds/year-table" bare :height="500" />

### Any entry, any exit

Buy at the end of one month, sell at the end of a later one: each point is the return of that
pair of dates. Of SPY's 1,176 pairs, 45 lost money (inside the dashed lines), and only one of
those was bought in the first half and sold in the second. Switch to IWM, where 128 pairs lost.

<Example id="demos/index-funds/buy-sell-contour" bare :height="560" />

SPY's return over the trailing 1 to 12 months, week by week. The 12-month return was negative
until May 2023 and again for three days in April 2025. Drag to orbit.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/rolling-return-surface" bare :height="600" />
</div>

## Day by day

A fund's daily returns in each half. On the log axis the tails show: SPY's first half ran from
−2.9% to +5.5%, its second from −5.9% to +10.5%.

<Example id="demos/index-funds/returns-histogram" bare :height="440" />

The same distributions as split violins, first half on the left of each fund and second half on
the right. The middle of the distribution barely changed; the second half grew longer tails.

<Example id="demos/index-funds/returns-violin" bare :height="460" />

The ten best and ten worst days. SPY's best day of the four years
({{ pct(spy.second.best.r, 1) }}, {{ fmtDate(spy.second.best.date) }}) came three sessions after
its worst ({{ pct(spy.second.worst.r, 1) }}, {{ fmtDate(spy.second.worst.date) }}).

<Example id="demos/index-funds/best-worst-days" bare :height="460" />

How rare big days are. SPY moved more than 1% on {{ spy.first.over1 }} days of the first half
and {{ spy.second.over1 }} of the second, and more than 2% on {{ spy.first.over2 }} days in each.

<Example id="demos/index-funds/days-funnel" bare :height="440" />

Every trading day sorted by half, by what the S&P 500 and the Russell 2000 did, and by where the
VIX closed. The VIX closed under 15 on 212 days of the first half and 63 of the second. Hover a
ribbon to count the days in it.

<Example id="demos/index-funds/days-parcats" bare :height="460" />

Monthly returns of each fund in each half, every month a point. SPY's median month was +2.8% in
the first half and +0.8% in the second.

<Example id="demos/index-funds/returns-box" bare :height="440" />

## Risk and return

The scorecard. SPY's return per unit of volatility went from 1.92 to 1.00, and every fund's
deepest fall was deeper in the second half.

<Example id="demos/index-funds/scorecard-table" bare :height="490" />

All 27 funds on the page by volatility and return, sized by deepest fall: the five index funds,
four size and style funds, the eleven S&P 500 sectors, and seven funds for other assets. Press
play to move from the first half to the second.

<Example id="demos/index-funds/risk-return" bare :height="540" />

Return per year in each half. Of the 27 funds only Energy did better in the second half; gold
made about 25% a year in both.

<Example id="demos/index-funds/halves-dumbbell" bare :height="720" />

Volatility, deepest fall and return together, with a line joining each fund's two halves. Drag
to orbit.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/risk-3d" bare :height="600" />
</div>

Every fund across seven axes. Drag along an axis to filter: gold's +146% came with a beta to SPY
of 0.24.

<Example id="demos/index-funds/etf-parcoords" bare :height="460" />

### Moving together

How closely daily returns track each other. SPY and QQQ correlate at
{{ correlation('SPY', 'QQQ', 'first').toFixed(2) }} and
{{ correlation('SPY', 'QQQ', 'second').toFixed(2) }} in the two halves, SPY and long Treasuries
(TLT) at {{ correlation('SPY', 'TLT', 'first').toFixed(2) }} in both. No pair is negative over a
whole half.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/correlation-heatmap" bare :height="600" />
</div>

Daily returns of each pair of funds, colored by half. Every pair was more correlated in the
second half.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/splom" bare :height="640" />
</div>

Where the days of SPY and IWM fall together: contours of a 2D histogram over the days
themselves.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/density" bare :height="600" />
</div>

QQQ against SPY, built with Holochart Express in one call: a least-squares line per half and
marginal histograms. QQQ moved {{ beta('QQQ', 'first').toFixed(2) }}% for each 1% of SPY in the
first half and {{ beta('QQQ', 'second').toFixed(2) }}% in the second.

<Example id="demos/index-funds/beta-express" bare :height="560" />

The correlation of SPY's daily returns with other assets over the trailing 63 days. The line for long Treasuries is below zero on 255 of the 1,002 days and above it on the rest: for most of the four years bonds moved with stocks, not against them.

<Example id="demos/index-funds/rolling-corr" bare :height="440" />

## Who led

Each fund divided by SPY and set to 100 at the start: above 100 it beat the S&P 500. QQQ ended
at 126. RSP, which holds the same 500 stocks in equal weights, ended at 78: it made +75% while the index made +125%.

<Example id="demos/index-funds/relative-strength" bare :height="440" />

### Sectors

The eleven sector funds that make up the S&P 500. Technology led both halves (+93%, then +75%).
Three sectors beat SPY in the first half and two in the second, Technology and Energy.

<Example id="demos/index-funds/sector-returns" bare :height="520" />

Quarter by quarter. Technology's +44% in the second quarter of 2026 and Energy's +38% the
quarter before are the two largest cells.

<Example id="demos/index-funds/sector-heatmap" bare :height="460" />

Ranked every six months. Five different sectors took first place in eight half-years. Technology was first in three of them and tenth in another.

<Example id="demos/index-funds/sector-ranks" bare :height="480" />

The two halves as polygons. The second-half polygon sits inside the first on ten of eleven
spokes; only Energy pokes out.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/sector-radar" bare :height="560" />
</div>

### Beyond US stocks

$10,000 in US stocks, international stocks, bonds, long Treasuries, gold and T-bills. Gold ended
ahead of the S&P 500 at $24,623, after peaking at $32,062 in January 2026. T-bills beat both
bond funds, and long Treasuries lost 11%.

<Example id="demos/index-funds/asset-growth" bare :height="460" />

The same assets ranked year by year. Gold was first in 2024 and 2025 and seventh in 2026; long
Treasuries were last in four of the five columns.

<Example id="demos/index-funds/asset-quilt" bare :height="480" />

A 60/40 portfolio of SPY and bonds, never rebalanced. It ended at $18,029, and its deepest fall
was 13% against SPY's 19%. By the end stocks were 75% of it.

<Example id="demos/index-funds/sixty-forty" bare :height="440" />

The 10-year Treasury yield and the 13-week bill yield. The bill yielded more than the 10-year on 524 of the 1,003 closes, 473 of them in the first half. The four years end with the
10-year at 5.29%, its highest close of the period.

<Example id="demos/index-funds/yields" bare :height="440" />

## What's inside the S&P 500

SPY's holdings on {{ fmtDate(HOLDINGS.SPY.asOf) }}, the day after the four years end, by sector
and stock. Technology is 40% of the fund; NVIDIA, Apple and Microsoft together are 21.5%, more
than any other whole sector. Click a sector to zoom in.

<Example id="demos/index-funds/sp500-treemap" bare :height="560" />

The same holdings as rings: sectors inside, and outside them the 32 stocks that weigh more than
0.5% each. Together those 32 are 57% of the index.

<div class="hc-demo-narrow">
  <Example id="demos/index-funds/sp500-sunburst" bare :height="600" />
</div>

By size. The ten largest holdings are {{ topShare('SPY', 10).toFixed(1) }}% of the fund, the 50
largest 64%, and the smallest 304 together 12%.

<Example id="demos/index-funds/sp500-icicle" bare :height="560" />

From the index to its sectors to each sector's three largest stocks. Three stocks are 80% of
Communication and 18% of Industrials.

<Example id="demos/index-funds/sector-sankey" bare :height="720" />

The Dow weights its 30 stocks by share price, so its ten largest are
{{ topShare('DIA', 10).toFixed(1) }}% of DIA, led by Goldman Sachs and Caterpillar.

<Example id="demos/index-funds/concentration" bare :height="440" />

Eight of the largest S&P 500 stocks against the index, on a log axis. $10,000 in NVIDIA became
$188,814. Amazon and Tesla finished below SPY.

<Example id="demos/index-funds/megacaps" bare :height="480" />

## Sources

<p class="hc-demo-source">
  Prices, the VIX and Treasury yields: Yahoo Finance, retrieved {{ fmtDate(RETRIEVED) }}. Returns
  use split- and dividend-adjusted prices. Holdings: State Street's daily holdings files for SPY,
  DIA and the eleven Select Sector SPDR funds, {{ fmtDate(HOLDINGS.SPY.asOf) }}; a stock's sector
  is the sector fund that holds it. Details:
  <a href="https://github.com/holochart/holochart/blob/main/examples/demos/index-funds/data/SOURCES.md" target="_blank" rel="noopener">SOURCES.md</a>.
  Chart sources: <a href="https://github.com/holochart/holochart/tree/main/examples/demos/index-funds" target="_blank" rel="noopener">examples/demos/index-funds</a>.
  This page is a charting demo, not investment advice.
</p>
