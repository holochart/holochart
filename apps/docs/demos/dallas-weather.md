---
title: Dallas weather
description: 87 years of daily weather at Dallas Love Field, charted with Holochart — every daily high and low on one zoomable axis, the year in days, heat waves and freezes, rain, wind and a warming trend, in 42 charts.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  CURRENT_YEAR,
  DATE,
  FIRST_DATE,
  FIRST_YEAR,
  fmtDate,
  LAST_DATE,
  LAST_YEAR,
  linreg,
  N,
  NORMALS,
  PRCP,
  RAIN_YEARS,
  THIS_YEAR,
  TMAX,
  TMIN,
  YEARLY,
} from '@mk7s/holochart-examples/demos/dallas-weather/analysis.mts';
import StatTiles from './components/StatTiles.vue';

const extreme = (values, pick) => {
  let at = -1;
  values.forEach((v, i) => {
    if (v !== null && (at < 0 || pick(v, values[at]))) at = i;
  });
  return { value: values[at], date: fmtDate(DATE[at]) };
};
const hottest = extreme(TMAX, (a, b) => a > b);
const coldest = extreme(TMIN, (a, b) => a < b);
const wettestDay = extreme(PRCP, (a, b) => a > b);
const by = (key) => [...YEARLY].sort((a, b) => b[key] - a[key]);
const hot = by('days100');
const avg100 = Math.round(YEARLY.reduce((s, y) => s + y.days100, 0) / YEARLY.length);
const rainSorted = [...RAIN_YEARS].sort((a, b) => b.rain - a.rain);
const wettest = rainSorted[0];
const driest = rainSorted.at(-1);
const normalRain = NORMALS.reduce((s, m) => s + m.rain, 0);
const trend = linreg(YEARLY.map((y) => y.year), YEARLY.map((y) => y.meanTemp)).m * 10;
const span = LAST_YEAR - FIRST_YEAR + 1;
const days = N.toLocaleString('en-US');

const stats = [
  {
    value: `${hottest.value} °F`,
    label: `hottest day, ${hottest.date}`,
    aside: `coldest night: ${coldest.value} °F, ${coldest.date}`,
  },
  {
    value: `${hot[0].days100} days`,
    label: `of 100 °F or more in ${hot[0].year}`,
    aside: `${hot[1].year}: ${hot[1].days100} · average year: ${avg100}`,
  },
  {
    value: `${normalRain.toFixed(0)} in`,
    label: 'of rain in a normal year',
    aside: `${driest.year}: ${driest.rain.toFixed(1)} · ${wettest.year}: ${wettest.rain.toFixed(1)}`,
  },
  {
    value: `+${trend.toFixed(2)} °F`,
    label: 'warming per decade',
    aside: `about ${((trend * span) / 10).toFixed(1)} °F over ${span} years`,
  },
];
</script>

<p class="hc-eyebrow">Dallas Love Field · daily data {{ fmtDate(FIRST_DATE) }} – {{ fmtDate(LAST_DATE) }}</p>

# 87 years of Dallas weather

<p class="hc-verdict">
  <strong>Hot, and getting hotter.</strong> Dallas has reached {{ hottest.value }} °F and fallen
  to {{ coldest.value }} °F. A normal year has about {{ avg100 }} days of 100 °F or more and
  {{ normalRain.toFixed(0) }} inches of rain, but single years have brought {{ hot[0].days100 }}
  such days and anywhere from {{ driest.rain.toFixed(0) }} to {{ wettest.rain.toFixed(0) }} inches.
  Through it all the city has warmed by about {{ trend.toFixed(1) }} °F a decade.
</p>

<StatTiles :items="stats" />

Every chart on this page is drawn from one file: the {{ days }} daily readings (high, low, rain,
snow, wind and thunder) taken at Dallas Love Field since August 1939 and published by NOAA. Each
is a Holochart example that runs live in your browser and doubles as a visual regression test.
Drag to zoom, hover for the day's numbers, and use the toggles above a chart to switch what it
shows. Love Field is not the official Dallas/Fort Worth station (that is DFW Airport, 25 km west),
so a record here can differ by a degree or two from the one in the news.

## {{ CURRENT_YEAR }} so far

The year through {{ fmtDate(LAST_DATE) }} against the 1991–2020 average for the same part of the
year: {{ THIS_YEAR.days100 }} days of 100 °F or more, a hottest day of {{ THIS_YEAR.hottest }} °F
and {{ THIS_YEAR.rain.toFixed(1) }} inches of rain.

<Example id="demos/dallas-weather/this-year" bare :height="300" />

Each bar is one day, from its low to its high, over the usual range for that date (darker band)
and the record range (pale band). Switch the year to see the summers of 1980 and 2011 or the
freeze of February 2021.

<Example id="demos/dallas-weather/year-in-days" bare :height="520" />

The same year as a calendar, one square per day, colored by the high.

<Example id="demos/dallas-weather/calendar-heatmap" bare :height="320" />

## The whole record

Every daily high and low since 1939 in one chart, more than 63,000 points. It opens on the last
five years; drag the slider or use the buttons to move between one year and the whole record.

<Example id="demos/dallas-weather/daily-record" bare :height="520" />

Each year's hottest day and coldest night. The hottest day is much the same every year; the
coldest night is not.

<Example id="demos/dallas-weather/hottest-coldest" bare :height="500" />

### The record book

The ten hottest days, coldest nights and wettest days. The wettest brought
{{ wettestDay.value.toFixed(2) }} inches on {{ wettestDay.date }}.

<Example id="demos/dallas-weather/records-table" bare :height="470" />

## Heat

Days of 100 °F or more in each year. {{ hot[0].year }} had {{ hot[0].days100 }} and
{{ hot[1].year }} had {{ hot[1].days100 }}; some years have none. Switch to freezing nights for
the other end of the thermometer.

<Example id="demos/dallas-weather/days-100" bare :height="480" />

The longest unbroken runs of 100 °F days.

<Example id="demos/dallas-weather/streaks" bare :height="520" />

Every 100 °F day on record, grouped by decade and year. The area of a tile is the number of such
days that year.

<Example id="demos/dallas-weather/hot-days-treemap" bare :height="520" />

### Four famous spells

The freeze of February 2021, the summers of 1980 and 2011, and the cold of December 1983, day by
day against what is normal for those dates.

<Example id="demos/dallas-weather/events" bare :height="500" />

## The seasons

The normal year: two wet seasons, in May and October, and a dry, hot July and August.

<Example id="demos/dallas-weather/climograph" bare :height="460" />

The year as a clock, with January at the top: the average high and low of every calendar day,
and the records outside and inside them. Record lows stray much further from the average than
record highs.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/seasons-clock" bare :height="560" />
</div>

The spread of daily highs in each month. A January day can be almost anything; a July day is
nearly always in the 90s.

<Example id="demos/dallas-weather/temp-ridgeline" bare :height="560" />

Every day of the record by its low and its high. Summer days bunch together in one bright patch,
while cool-season days spread widely.

<Example id="demos/dallas-weather/high-low-density" bare :height="560" />

Every day sorted by season, by how warm it got, and by whether it rained.

<Example id="demos/dallas-weather/day-types" bare :height="520" />

### The freeze-free season

The last freeze of spring and the first of fall in each year, with the growing season between
them.

<Example id="demos/dallas-weather/freeze-dates" bare :height="480" />

## Getting warmer

One stripe per year, blue if cooler and red if warmer than the long-run average.

<Example id="demos/dallas-weather/warming-stripes" bare :height="420" />

The same numbers as bars, with a ten-year average and the trend: about {{ trend.toFixed(2) }} °F
per decade.

<Example id="demos/dallas-weather/annual-mean" bare :height="480" />

Every month since 1940. Switch to "Difference from normal" to take the seasons out and see the
unusual months.

<Example id="demos/dallas-weather/month-year-heatmap" bare :height="460" />

Daily highs in the first and the last 30 years of the record. The whole distribution has moved
to the right.

<Example id="demos/dallas-weather/temp-histogram" bare :height="440" />

Summer afternoons and winter nights by decade.

<Example id="demos/dallas-weather/decade-box" bare :height="480" />

### Which part of the year warmed

The average high through the year for three 30-year periods, and the change from the first to
the last.

<Example id="demos/dallas-weather/seasons-shift" bare :height="560" />

Press Play to watch the seasonal curve move from the 1940s to the 2020s against today's normal.

<Example id="demos/dallas-weather/animated-months" bare :height="560" />

### The record in 3D

{{ span }} years of weekly highs as a landscape. Every year is one wave, so the summers line up
as a ridge running through the decades. Drag to turn it.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/temp-surface" bare :height="560" />
</div>

Every month since 1940 as a spiral, once round per year, pushed outward when the month was
warmer than normal. Single months swing far more than the climate has shifted, so the widening
toward the top is faint.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/climate-spiral" bare :height="560" />
</div>

## Rain

Rain per year. {{ wettest.year }} was the wettest with {{ wettest.rain.toFixed(1) }} inches and
{{ driest.year }} the driest with {{ driest.rain.toFixed(1) }}. The years 1997 and 1998 are left
out because the rain record has gaps.

<Example id="demos/dallas-weather/rain-annual" bare :height="460" />

Each line is one year's rain adding up from January 1. Flat stretches are dry spells and jumps
are storms.

<Example id="demos/dallas-weather/rain-cumulative" bare :height="520" />

Rain of every month since 1940.

<Example id="demos/dallas-weather/rain-heatmap" bare :height="440" />

### A normal year of rain

How a normal year adds up, month by month.

<Example id="demos/dallas-weather/rain-waterfall" bare :height="440" />

The same year by season. Click a season to zoom in.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/rain-sunburst" bare :height="560" />
</div>

Average monthly rain in each decade: the May and October ridges and the summer valley run
through all of them.

<Example id="demos/dallas-weather/rain-3d" bare :height="600" />

### How it rains

Most rainy days bring little: more than half have under a quarter inch.

<Example id="demos/dallas-weather/rain-histogram" bare :height="440" />

It rains on about one day in five, and heavy rain is rare.

<Example id="demos/dallas-weather/rain-funnel" bare :height="460" />

### Dry spells

The twelve longest runs of days without measurable rain. Most began in summer.

<Example id="demos/dallas-weather/dry-spells" bare :height="480" />

Dry summers are hot summers: each summer's rain against its average afternoon high.

<Example id="demos/dallas-weather/summer-bubbles" bare :height="520" />

## Storms, snow and wind

Days with thunder in each month. Spring is storm season.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/thunder-polar" bare :height="560" />
</div>

Snowfall per winter. Many winters have none; the shaded years have no snowfall record.

<Example id="demos/dallas-weather/snow-years" bare :height="440" />

### Wind

Where the day's strongest wind comes from, since 1997: mostly the south, and the north behind
cold fronts. Switch the season to see the winter northers.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/wind-rose" bare :height="560" />
</div>

One dot per day, more than 10,000 of them, placed by the direction and speed of the day's
fastest wind.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/gusts-polar" bare :height="560" />
</div>

Spring is also the windy season.

<Example id="demos/dallas-weather/wind-month-box" bare :height="440" />

## Years compared

Each line is one year across seven measures. Drag along an axis to pick out years; the recent
ones (red) run warmer, with fewer freezes.

<Example id="demos/dallas-weather/years-parcoords" bare :height="460" />

Four yearly measures against each other. Warm years have fewer freezing nights, and dry years
have more 100 °F days.

<div class="hc-demo-narrow">
  <Example id="demos/dallas-weather/years-splom" bare :height="760" />
</div>

## Sources

<p class="hc-demo-source">
  Daily readings: NOAA Global Historical Climatology Network Daily, station USW00013960 (Dallas
  Love Field), {{ fmtDate(FIRST_DATE) }} to {{ fmtDate(LAST_DATE) }}; public domain. "Normal"
  means the 1991–2020 average. Wind is from April 1997 on; the rain record has gaps in 1997 and
  1998 and the snowfall record in 1973–76 and 1997–2004, and those years are left out of the
  charts concerned. Details:
  <a href="https://github.com/holochart/holochart/blob/main/examples/demos/dallas-weather/data/SOURCES.md" target="_blank" rel="noopener">SOURCES.md</a>.
  Chart sources: <a href="https://github.com/holochart/holochart/tree/main/examples/demos/dallas-weather" target="_blank" rel="noopener">examples/demos/dallas-weather</a>.
</p>
