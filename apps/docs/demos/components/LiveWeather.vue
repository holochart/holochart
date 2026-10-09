<script setup lang="ts">
/**
 * The live weather demo: a zip code goes in, the reader's browser fetches the forecast (nothing is
 * bundled with the page), and six Holochart charts are drawn from the response. A new zip code
 * redraws the same charts with `chart.react`.
 *
 * The data, figure and linking code lives in `examples/demos/live-weather/*.mts`, where the unit
 * tests reach it; this component is the form, the day strip and the chart lifecycle. Holochart
 * itself is imported on the first request, so server-side rendering never loads it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { Chart, Figure } from '@mk7s/holochart';
import {
  GRID_METRICS,
  dayLabel,
  hourGridFigure,
  precipFigure,
  sideMargins,
  skyFigure,
  temperatureFigure,
  timeRange,
  windFigure,
  windRoseFigure,
  type GridMetric,
  type View,
} from '@mk7s/holochart-examples/demos/live-weather/charts.mts';
import {
  FORECAST_DAYS,
  WeatherError,
  describeCode,
  loadWeather,
  normalizeZip,
  type Forecast,
} from '@mk7s/holochart-examples/demos/live-weather/data.mts';
import { linkCharts, type Link } from '@mk7s/holochart-examples/demos/live-weather/link.mts';
import { clock, headline } from '@mk7s/holochart-examples/demos/live-weather/summary.mts';
import StatTiles from './StatTiles.vue';
import WeatherIcon from './WeatherIcon.vue';

const SAMPLES = [
  { zip: '75201', place: 'Dallas' },
  { zip: '10001', place: 'New York' },
  { zip: '98101', place: 'Seattle' },
  { zip: '80202', place: 'Denver' },
  { zip: '33131', place: 'Miami' },
  { zip: '99501', place: 'Anchorage' },
];
const SPANS = [3, 5, FORECAST_DAYS];
const SERIES = ['temperature', 'sky', 'precip', 'wind'] as const;
type ChartName = (typeof SERIES)[number] | 'grid' | 'rose';

const zip = ref('');
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const message = ref('');
const forecast = shallowRef<Forecast | null>(null);
const days = ref(FORECAST_DAYS);
const metric = ref<GridMetric>('temperature');
const narrow = ref(false);

const root = ref<HTMLElement | null>(null);
const stages: Record<ChartName, ReturnType<typeof ref<HTMLElement | null>>> = {
  temperature: ref(null),
  sky: ref(null),
  precip: ref(null),
  wind: ref(null),
  grid: ref(null),
  rose: ref(null),
};
const setStage = (name: ChartName) => (el: unknown) => {
  stages[name].value = el as HTMLElement | null;
};

let charts: Record<ChartName, Chart> | null = null;
let link: Link | null = null;
let request: AbortController | null = null;
let unmounted = false;

const stats = computed(() => (forecast.value ? headline(forecast.value) : []));
const strip = computed(() =>
  (forecast.value?.days ?? []).slice(0, days.value).map((d) => ({
    ...d,
    ...describeCode(d.code),
    label: dayLabel(d.date),
  })),
);
const stripStyle = computed(() => {
  const { l, r } = sideMargins(narrow.value);
  return {
    gridTemplateColumns: `repeat(${strip.value.length}, minmax(0, 1fr))`,
    paddingLeft: `${l}px`,
    paddingRight: `${r}px`,
  };
});
const deg = (v: number | null): string => (v === null ? '–' : `${Math.round(v)}°`);

const view = (): View => ({ narrow: narrow.value, days: days.value });

function figures(f: Forecast): Record<ChartName, Figure> {
  const v = view();
  const config = v.narrow ? { responsive: true, displayModeBar: false } : { responsive: true };
  const built: Record<ChartName, Figure> = {
    temperature: temperatureFigure(f, v),
    sky: skyFigure(f, v),
    precip: precipFigure(f, v),
    wind: windFigure(f, v),
    grid: hourGridFigure(f, metric.value, v),
    rose: windRoseFigure(f, v),
  };
  for (const name of Object.keys(built) as ChartName[]) built[name] = { ...built[name], config };
  return built;
}

async function draw(f: Forecast): Promise<void> {
  await nextTick();
  const built = figures(f);
  if (charts) {
    const live = charts;
    await Promise.all((Object.keys(built) as ChartName[]).map((n) => live[n].react(built[n])));
    link?.show(timeRange(f, days.value));
    return;
  }
  const { createChart } = await import('@mk7s/holochart');
  if (unmounted || charts) return;
  const made = {} as Record<ChartName, Chart>;
  for (const name of Object.keys(built) as ChartName[]) {
    const el = stages[name].value;
    if (!el) return;
    made[name] = createChart(el, built[name]);
  }
  charts = made;
  link = linkCharts(
    SERIES.map((n) => made[n]),
    timeRange(f, days.value),
  );
}

async function load(input: string = zip.value): Promise<void> {
  let code: string;
  try {
    code = normalizeZip(input);
  } catch (error) {
    status.value = 'error';
    message.value = (error as Error).message;
    return;
  }
  zip.value = code;
  request?.abort();
  const mine = (request = new AbortController());
  status.value = 'loading';
  message.value = `Loading the forecast for ${code}…`;
  try {
    const f = await loadWeather(code, (url, init) => fetch(url, init), mine.signal);
    if (mine !== request || unmounted) return;
    narrow.value = (root.value?.clientWidth ?? 0) > 0 && (root.value?.clientWidth ?? 0) < 600;
    forecast.value = f;
    status.value = 'ready';
    message.value = '';
    await draw(f);
  } catch (error) {
    if (mine !== request || unmounted) return;
    status.value = 'error';
    message.value =
      error instanceof WeatherError ? error.message : 'Something went wrong drawing the forecast.';
  }
}

function showDays(n: number): void {
  days.value = n;
  if (forecast.value) link?.show(timeRange(forecast.value, n));
}

function showMetric(m: GridMetric): void {
  metric.value = m;
  if (forecast.value && charts) {
    void charts.grid.react(figures(forecast.value).grid);
  }
}

onMounted(() => {
  // Ten days of hourly lines do not fit a phone; start those on three.
  if (window.matchMedia('(max-width: 639px)').matches) days.value = SPANS[0] as number;
});

onBeforeUnmount(() => {
  unmounted = true;
  request?.abort();
  link?.dispose();
  if (charts) for (const chart of Object.values(charts)) chart.destroy();
  charts = null;
});
</script>

<template>
  <div ref="root" class="hc-lw">
    <form class="hc-lw-form" @submit.prevent="load()">
      <label class="hc-lw-label" for="hc-lw-zip">US zip code</label>
      <div class="hc-lw-row">
        <input
          id="hc-lw-zip"
          v-model="zip"
          class="hc-lw-input"
          type="text"
          inputmode="numeric"
          autocomplete="postal-code"
          maxlength="10"
          placeholder="75201"
          aria-describedby="hc-lw-status"
        />
        <button class="hc-lw-go" type="submit" :disabled="status === 'loading'">
          Show the weather
        </button>
      </div>
      <div class="hc-lw-samples">
        <span>or try</span>
        <button
          v-for="s in SAMPLES"
          :key="s.zip"
          type="button"
          class="hc-lw-chip"
          :disabled="status === 'loading'"
          @click="load(s.zip)"
        >
          {{ s.zip }} <span>{{ s.place }}</span>
        </button>
      </div>
      <p
        id="hc-lw-status"
        class="hc-lw-status"
        :class="{ 'is-error': status === 'error' }"
        :role="status === 'error' ? 'alert' : 'status'"
      >
        {{ message }}
      </p>
    </form>

    <p v-if="!forecast" class="hc-lw-empty">
      Nothing is loaded yet. Enter a zip code and the charts are drawn from the forecast your
      browser fetches for it.
    </p>

    <div v-else class="hc-lw-result" :class="{ 'is-loading': status === 'loading' }">
      <p class="hc-eyebrow">
        {{ forecast.place.zip }} · {{ forecast.timezone.replace(/_/g, ' ') }} · as of
        {{ clock(forecast.current.time) }} local time
      </p>
      <h2 class="hc-lw-place">
        {{ forecast.place.name
        }}<template v-if="forecast.place.state">, {{ forecast.place.state }}</template>
      </h2>
      <StatTiles :items="stats" />

      <div class="hc-lw-bar">
        <h3>Hour by hour</h3>
        <div class="hc-lw-seg" role="group" aria-label="Days shown">
          <button
            v-for="n in SPANS"
            :key="n"
            type="button"
            :aria-pressed="days === n"
            @click="showDays(n)"
          >
            {{ n }} days
          </button>
        </div>
      </div>
      <p class="hc-demo-caption">
        Four charts on one time axis. Drag across any of them to zoom all four, double-click to zoom
        back out, and hover to read every panel at the same hour. Shaded bands are night; the white
        line is now.
      </p>

      <div class="hc-lw-frame">
        <ol class="hc-lw-strip" :class="{ 'is-dense': strip.length > 5 }" :style="stripStyle">
          <li v-for="d in strip" :key="d.date">
            <span class="hc-lw-day">{{ d.label }}</span>
            <span class="hc-lw-temps"
              ><b>{{ deg(d.high) }}</b> <i>{{ deg(d.low) }}</i></span
            >
            <WeatherIcon :sky="d.sky" />
            <span class="hc-lw-sky">{{ describeCode(d.code).label }}</span>
            <span class="hc-lw-rain" :class="{ 'is-dry': (d.precip ?? 0) < 0.005 }"
              >{{ (d.precip ?? 0).toFixed(2) }} in</span
            >
          </li>
        </ol>
        <div
          v-for="name in SERIES"
          :key="name"
          :ref="setStage(name)"
          class="hc-lw-stage"
          :style="{ height: narrow ? '220px' : '250px' }"
        ></div>
      </div>

      <div class="hc-lw-bar">
        <h3>The daily cycle</h3>
        <div class="hc-lw-seg" role="group" aria-label="Measure">
          <button
            v-for="(m, key) in GRID_METRICS"
            :key="key"
            type="button"
            :aria-pressed="metric === key"
            @click="showMetric(key)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
      <p class="hc-demo-caption">
        The same hourly forecast as a heatmap: a column per day, a row per hour, midnight at the
        top. The daily cycle reads down a column; a change in the weather reads across.
      </p>
      <div class="hc-lw-frame">
        <div
          :ref="setStage('grid')"
          class="hc-lw-stage"
          :style="{ height: narrow ? '380px' : '440px' }"
        ></div>
      </div>

      <div class="hc-lw-bar">
        <h3>Where the wind comes from</h3>
      </div>
      <p class="hc-demo-caption">
        Share of the forecast’s hours by wind direction, stacked outward by speed. North is at the
        top.
      </p>
      <div class="hc-lw-frame hc-demo-narrow">
        <div
          :ref="setStage('rose')"
          class="hc-lw-stage"
          :style="{ height: narrow ? '420px' : '460px' }"
        ></div>
      </div>

      <p class="hc-demo-source">
        Forecast:
        <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0),
        at {{ forecast.place.latitude.toFixed(2) }}°, {{ forecast.place.longitude.toFixed(2) }}°.
        Zip code lookup:
        <a href="https://www.zippopotam.us/" target="_blank" rel="noopener">Zippopotam.us</a>. Times
        are local to the place.
      </p>
    </div>
  </div>
</template>

<style scoped>
.hc-lw {
  margin: 24px 0;
}

.hc-lw-form {
  padding: 16px;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  background: var(--hc-surface-1);
}

.hc-lw-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--hc-text);
}

.hc-lw-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hc-lw-input {
  width: 9.5em;
  padding: 8px 12px;
  border: 1px solid var(--hc-axis);
  border-radius: 4px;
  background: var(--hc-bg);
  color: var(--hc-title);
  font-family: var(--vp-font-family-mono);
  font-size: 18px;
  letter-spacing: 0.08em;
}

.hc-lw-input:focus-visible,
.hc-lw-go:focus-visible,
.hc-lw-chip:focus-visible,
.hc-lw-seg button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.hc-lw-go {
  padding: 8px 16px;
  border: 1px solid var(--hc-zero);
  border-radius: 4px;
  background: var(--hc-surface-3);
  color: var(--hc-title);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.hc-lw-go:hover:not(:disabled) {
  border-color: var(--hc-tick);
}

.hc-lw-go:disabled,
.hc-lw-chip:disabled {
  opacity: 0.55;
  cursor: progress;
}

.hc-lw-samples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--hc-tick);
}

.hc-lw-chip {
  padding: 3px 8px;
  border: 1px solid var(--hc-axis);
  border-radius: 3px;
  background: transparent;
  color: var(--hc-title);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  cursor: pointer;
}

.hc-lw-chip span {
  color: var(--hc-tick);
  font-family: var(--vp-font-family-base);
}

.hc-lw-chip:hover:not(:disabled) {
  border-color: var(--hc-tick);
}

.hc-lw-status {
  min-height: 20px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--hc-text);
}

.hc-lw-status.is-error {
  color: #f0525c;
}

.hc-lw-empty {
  margin: 16px 0 0;
  padding: 40px 16px;
  border: 1px dashed var(--hc-axis);
  border-radius: 4px;
  text-align: center;
  color: var(--hc-tick);
}

.hc-lw-result {
  margin-top: 28px;
  transition: opacity 0.15s;
}

.hc-lw-result.is-loading {
  opacity: 0.55;
}

.hc-lw-result .hc-lw-place {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 30px;
  line-height: 36px;
}

.hc-lw-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 36px 0 8px;
}

.hc-lw-bar h3 {
  margin: 0;
}

.hc-lw-seg {
  display: inline-flex;
  flex-wrap: wrap;
  padding: 1px;
  border: 1px solid var(--hc-axis);
  border-radius: 3px;
}

.hc-lw-seg button {
  padding: 5px 10px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--hc-tick);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.hc-lw-seg button[aria-pressed='true'] {
  background: var(--hc-grid);
  box-shadow: inset 0 0 0 1px var(--hc-zero);
  color: var(--hc-title);
}

.hc-lw-frame {
  margin: 12px 0;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  background: var(--hc-bg);
  overflow: hidden;
}

.hc-lw-stage {
  width: 100%;
  position: relative;
}

.hc-lw-stage :deep(canvas) {
  display: block;
}

.hc-lw-strip {
  display: grid;
  margin: 0;
  padding-top: 12px;
  padding-bottom: 4px;
  list-style: none;
}

.hc-lw-strip li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  margin: 0;
  padding: 0 2px;
  border-left: 1px solid var(--hc-grid);
  text-align: center;
}

.hc-lw-strip li:last-child {
  border-right: 1px solid var(--hc-grid);
}

.hc-lw-day {
  font-size: 13px;
  font-weight: 600;
  color: var(--hc-title);
  white-space: nowrap;
}

.hc-lw-temps {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.hc-lw-temps b {
  color: #f0525c;
}

.hc-lw-temps i {
  font-style: normal;
  color: #7f93ea;
}

.hc-lw-icon {
  width: 44px;
  height: 44px;
  max-width: 100%;
}

.hc-lw-sky {
  min-height: 32px;
  font-size: 12px;
  line-height: 16px;
  color: var(--hc-text);
}

.hc-lw-rain {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: #3aa0c8;
}

.hc-lw-rain.is-dry {
  color: var(--hc-tick);
}

@media (max-width: 760px) {
  .hc-lw-strip.is-dense .hc-lw-sky,
  .hc-lw-strip.is-dense .hc-lw-rain {
    display: none;
  }

  .hc-lw-strip.is-dense .hc-lw-day,
  .hc-lw-strip.is-dense .hc-lw-temps {
    font-size: 10px;
    white-space: normal;
  }
}

@media (max-width: 639px) {
  .hc-lw-frame {
    margin: 12px -24px;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }
}
</style>
