---
title: Framework integration
description: Recipes for React, Vue, Svelte and Angular — create the chart when the component mounts, update it with react, resize it with its container and purge it on unmount.
status: draft
---

# Framework integration

Holochart has no framework wrappers yet. You don't need one: a chart lives in a DOM element, and
four calls cover a component's whole life.

| When                  | Call                           | What it does                                                              |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| The component mounts  | `newPlot(el, figure)`          | Creates the chart in `el`. Resolves to the `Chart` after the first frame. |
| The figure changes    | `react(el, figure)`            | Diffs the new figure against the current one and redraws what changed.    |
| The container resizes | `config: { responsive: true }` | The chart follows the size of `el`. Or call `chart.resize()` yourself.    |
| The component leaves  | `purge(el)`                    | Destroys the chart and frees its WebGL context, GPU memory and listeners. |

The recipes below are the same component in four frameworks: it takes a `figure` prop, fills its
container, and cleans up after itself.

::: info How these recipes were checked
The Holochart calls in every recipe are type-checked against the library, and the sequence they
make (mount, update, resize, unmount, and React's mount–unmount–mount in Strict Mode) is run in
Chromium. The Vue component is run as written. The React, Svelte and Angular components have not
been run inside their frameworks yet.
:::

## The rules

A few things hold in every framework.

**Give the element a size.** The chart takes the width and height of its element, unless
`layout.width` or `layout.height` set them. An element without a height gets the default height,
450 px. Set the size in CSS, as the recipes do.

**Leave the element's children alone.** Holochart puts its canvas, hover labels and
[accessibility content](./accessibility) inside the element, and sets `role` and `aria-*`
attributes on it. Render the element empty and don't let the framework manage what is inside.

**Replace data, don't mutate it.** `react` compares data arrays by reference, like Plotly's.
Pushing a point onto an existing array changes nothing on screen; pass a new array, or append
with `extendTraces`.

**Pass the same `config` every time.** `react(el, figure)` applies the figure's `config` too, and
a changed `config` re-creates the chart's renderer. Keep `config` in the figure, or pass the same
object to `newPlot` and `react`.

**Always purge.** A chart that is removed from the DOM without `purge(el)` keeps its WebGL
context, and browsers only allow a few (see [Dashboards](./dashboards#webgl-contexts)). `purge`
on an element without a chart does nothing, so it is safe to call from any cleanup hook.

**Handle the rejection.** `newPlot` and `react` return promises. They reject when the browser has
no WebGL2 (see [Troubleshooting](./troubleshooting#no-webgl2)), so attach a `catch`.

## React

```tsx
import { useEffect, useRef } from 'react';
import { newPlot, purge, react, type Figure } from '@mk7s/holochart';

export function Chart({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLDivElement>(null);

  // Mount: create the chart. Unmount: destroy it.
  useEffect(() => {
    const el = ref.current!;
    newPlot(el, figure).catch(console.error);
    return () => purge(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update: a new figure object redraws what changed. On mount this is a no-op.
  useEffect(() => {
    react(ref.current!, figure).catch(console.error);
  }, [figure]);

  return <div ref={ref} style={{ width: '100%', height: 400 }} />;
}
```

Use it with a figure that only changes when the data does, or every render redraws:

```tsx
import { useMemo } from 'react';
import type { Figure } from '@mk7s/holochart';
import { Chart } from './Chart';

export function Revenue({ months, values }: { months: string[]; values: number[] }) {
  const figure = useMemo<Figure>(
    () => ({
      data: [{ type: 'bar', x: months, y: values }],
      layout: { title: { text: 'Revenue' } },
      config: { responsive: true },
    }),
    [months, values],
  );
  return <Chart figure={figure} />;
}
```

In development, Strict Mode mounts, unmounts and mounts the component again. The effects above
handle that: the first chart is purged before it draws, and the second one takes its place.

## Vue

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { newPlot, purge, react, type Figure } from '@mk7s/holochart';

const props = defineProps<{ figure: Figure }>();
const el = ref<HTMLDivElement>();

onMounted(() => {
  newPlot(el.value!, props.figure).catch(console.error);
});

// Runs when the parent passes a new figure object.
watch(
  () => props.figure,
  (figure) => {
    if (el.value) react(el.value, figure).catch(console.error);
  },
);

onBeforeUnmount(() => {
  if (el.value) purge(el.value);
});
</script>

<template>
  <div ref="el" style="width: 100%; height: 400px" />
</template>
```

Keep the figure in a `shallowRef` in the parent, and assign a new object to update the chart.
A deep `ref` wraps every trace and data array in a reactive proxy, which costs time on large
arrays and gains nothing: the watcher above only fires when the figure object itself is replaced.

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import type { Figure } from '@mk7s/holochart';
import Chart from './Chart.vue';

const figure = shallowRef<Figure>({
  data: [{ type: 'bar', x: ['Jan', 'Feb', 'Mar'], y: [12, 18, 15] }],
  config: { responsive: true },
});

function addMonth() {
  const bar = { type: 'bar' as const, x: ['Jan', 'Feb', 'Mar', 'Apr'], y: [12, 18, 15, 21] };
  figure.value = { ...figure.value, data: [bar] };
}
</script>

<template>
  <Chart :figure="figure" />
  <button @click="addMonth">Add April</button>
</template>
```

## Svelte

Svelte 5, with runes:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { newPlot, purge, react, type Figure } from '@mk7s/holochart';

  let { figure }: { figure: Figure } = $props();
  let el: HTMLDivElement;

  onMount(() => {
    newPlot(el, figure).catch(console.error);
    return () => purge(el);
  });

  // Runs when `figure` is replaced. Right after mount it is a no-op.
  $effect(() => {
    react(el, figure).catch(console.error);
  });
</script>

<div bind:this={el} style="width: 100%; height: 400px"></div>
```

In the parent, hold the figure in `$state.raw` and assign a new object to update the chart.
Plain `$state` makes the figure and its arrays deeply reactive proxies, which, as in Vue, costs
time on large arrays for no gain.

## Angular

<!-- docs-gates: no-typecheck -->

```ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { newPlot, purge, react, type Figure } from '@mk7s/holochart';

@Component({
  selector: 'app-chart',
  standalone: true,
  template: '<div #host style="width: 100%; height: 400px"></div>',
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) figure!: Figure;
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private mounted = false;

  ngAfterViewInit(): void {
    this.mounted = true;
    // Outside Angular's zone, so pointer moves over the chart don't run change detection.
    this.zone.runOutsideAngular(() => {
      newPlot(this.host.nativeElement, this.figure).catch(console.error);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.mounted || !changes['figure']) return;
    this.zone.runOutsideAngular(() => {
      react(this.host.nativeElement, this.figure).catch(console.error);
    });
  }

  ngOnDestroy(): void {
    purge(this.host.nativeElement);
  }
}
```

`ngOnChanges` runs when the parent binds a new figure object (`[figure]="figure"`), not when it
mutates the old one. A chart event listener that changes component state has to step back into
the zone: `chart.on('click', (e) => this.zone.run(() => this.selected.set(e.points[0])))`.

## Resizing

With `config: { responsive: true }`, the chart watches its element with a `ResizeObserver` and
redraws at the new size, so it follows a flex or grid layout, a sidebar that collapses, or the
window. Only the dimensions the figure leaves open follow the element: a chart with
`layout.width` and `layout.height` keeps that size.

Without `responsive`, the chart keeps the size it was created with. Resize it yourself with
`chart.resize()`, for example after a panel finishes its opening animation:

```ts
import { getChart } from '@mk7s/holochart';

await getChart(el)?.resize();
```

Either way the chart emits [`resize`](/reference/events) with the new `width` and `height`.

A chart created in a hidden element (an inactive tab, a closed dialog) is covered in
[Troubleshooting](./troubleshooting#hidden-and-zero-size-containers).

## Events and the chart object

`newPlot` resolves to the [`Chart`](/reference/api/holochart-runtime/classes/Chart), and
`getChart(el)` returns the chart of an element at any time, or `undefined`. Subscribe to
[events](/reference/events) once the chart exists; `react` keeps the same chart, so listeners
survive updates, and `purge` removes them.

```ts
import { newPlot } from '@mk7s/holochart';

const chart = await newPlot(el, figure);
chart.on('click', (event) => console.log(event.points[0]?.x));
```

A new figure resets what the user did to the old one, such as a zoom. To keep it across `react`
calls, set [`layout.uirevision`](/reference/layout#uirevision) to a value that stays the same
for as long as the view should be kept, as in Plotly.

## Server-rendered apps

The recipes create the chart in mount hooks, which run only in the browser in React, Vue and
Svelte, so they work unchanged in Next.js, Nuxt and SvelteKit. See
[Server-side rendering](./ssr) for loading Holochart on the client only. In Angular,
`ngAfterViewInit` also runs during server rendering: guard the `newPlot` call with
`isPlatformBrowser`, or create the chart in `afterNextRender`.
