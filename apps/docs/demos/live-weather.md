---
title: Live weather by zip code
description: Type a US zip code and Holochart draws the forecast your browser just fetched — hourly temperature, sky, rain and wind on linked time axes, a day-by-hour heatmap and a wind rose. No data ships with the page.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import LiveWeather from './components/LiveWeather.vue';
</script>

<p class="hc-eyebrow">Live data · any US zip code · 10-day hourly forecast</p>

# The weather where you are, charted on demand

<p class="hc-verdict">
  <strong>No data ships with this page.</strong> Enter a zip code and your browser asks for the
  forecast there, then Holochart draws it: six charts built from about 3,000 hourly values, and
  redrawn in place when you ask for another zip code.
</p>

<LiveWeather />

## How it works

The other demos read a JSON file that was prepared ahead of time. This one starts empty. On a
request the page makes two calls from your browser: the zip code goes to
[Zippopotam.us](https://www.zippopotam.us/), which answers with a latitude and longitude, and
those go to [Open-Meteo](https://open-meteo.com/), which answers with ten days of hourly values in
°F, mph and inches and in the place’s own time zone. Neither needs an API key.

- **Figures are plain functions of the response.** Each chart is built by a function that takes the
  parsed forecast and returns a figure, so the first zip code goes to `createChart` and every later
  one to `chart.react`, which diffs the new figure against the old and keeps the canvas.
- **Local time without a time zone library.** Open-Meteo returns wall-clock times such as
  `2026-10-03T14:00`. Holochart reads a date string with no offset as written, so the axis shows
  the place’s local time whatever time zone the reader is in.
- **Four charts, one time axis.** The hourly charts are separate charts linked with events: a
  `relayout` on one is applied to the others with `chart.relayout`, and a `hover` on one calls
  `chart.hover({ xval })` on the others. The night bands and the “now” line are layout shapes with
  `yref: 'paper'`.
- **Two y axes where two units share a panel.** Pressure sits on a right-hand axis over the
  percentage panel, and the running rain total on one over the hourly bars (`overlaying: 'y'`).

The forecast model has no separate chance of snow, so the precipitation panel shows hourly snowfall
as its own bars on the days that have any.
