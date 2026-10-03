---
title: Server-side rendering
description: Use Holochart in Next.js, Nuxt and other server-rendered apps — what is safe on the server, and how to load the chart on the client only.
status: draft
---

# Server-side rendering

A chart is drawn with WebGL in the browser, so the server renders an empty element of the right
size and the browser fills it in. This guide covers what you can do on the server, and how to
keep Holochart out of the server render and the first JavaScript bundle in Next.js and Nuxt.

## What works on the server

**Importing Holochart is safe.** `import '@mk7s/holochart'` touches neither `window` nor
`document`: the module loads in Node without a DOM, so a component that imports it can be
rendered on the server. This was checked by importing the ESM build in Node 26.

**Building figures works.** A figure is plain data. You can assemble it on the server, including
with [Express](/express/), and send it to the browser as JSON:

```ts
import { express } from '@mk7s/holochart';

// On the server: rows from a database, a figure out.
const figure = express.bar(
  [
    { month: 'Jan', revenue: 12 },
    { month: 'Feb', revenue: 18 },
  ],
  { x: 'month', y: 'revenue' },
);
const body = JSON.stringify(figure);
```

**Drawing does not.** `newPlot`, `createChart` and `toImage` need a DOM element and a WebGL2
context, and throw without them. Call them from code that only runs in the browser: a mount
hook, or an event handler. There is no server-side image export yet; to make chart images on a
server, drive a headless browser and call [`toImage`](./export) in the page.

## Reserve the space

Give the chart's element its size in CSS, so that the server-rendered page already has the
chart's box and nothing moves when the chart appears:

```html
<div style="width: 100%; height: 400px"></div>
```

An element without a height gets a chart of the default height, 450 px, and the page shifts by
that much when it draws.

## Next.js

The [React recipe](./frameworks#react) works as it is in a Client Component: effects don't run
on the server, and the import is safe there.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { newPlot, purge, react, type Figure } from '@mk7s/holochart';

export function Chart({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    newPlot(el, figure).catch(console.error);
    return () => purge(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    react(ref.current!, figure).catch(console.error);
  }, [figure]);

  return <div ref={ref} style={{ width: '100%', height: 400 }} />;
}
```

A Server Component can build the figure and pass it down as a prop. Functions cannot cross from
a Server Component to a Client Component, so add [style functions](/fundamentals/conditional-styling)
and `config.renderHover` in the client.

That component puts Holochart and three.js in the page's JavaScript. To load them only when a
chart is shown, import the component with `next/dynamic` and `ssr: false`, from another Client
Component:

```tsx
'use client';

import dynamic from 'next/dynamic';

export const LazyChart = dynamic(() => import('./Chart').then((m) => m.Chart), {
  ssr: false,
  // The same box as the chart, so the page doesn't move when it loads.
  loading: () => <div style={{ width: '100%', height: 400 }} />,
});
```

## Nuxt

The [Vue recipe](./frameworks#vue) works as it is: `onMounted` doesn't run on the server. To
keep the component out of the server render and load its code on the client only, name the file
`Chart.client.vue`, or wrap it in `<ClientOnly>` with a placeholder of the same size:

```vue
<template>
  <ClientOnly>
    <Chart :figure="figure" />
    <template #fallback>
      <div style="width: 100%; height: 400px" />
    </template>
  </ClientOnly>
</template>
```

Fetch the figure with `useFetch` or `useAsyncData` as usual. Keep it in a `shallowRef`, or mark
it with `markRaw`, so that Vue doesn't make its data arrays deeply reactive.

## Other frameworks

The rule is the same everywhere: import freely, draw on mount.

- **SvelteKit**: `onMount` doesn't run on the server, so the
  [Svelte recipe](./frameworks#svelte) works as it is.
- **Angular**: `ngAfterViewInit` also runs during server rendering. Guard the `newPlot` call
  with `isPlatformBrowser`, or create the chart in `afterNextRender`.

## Without WebGL2

A browser without WebGL2 gets a short note and the chart's text description in the element
instead of a chart, and `newPlot` rejects with a `WebGLUnavailableError`. See
[Troubleshooting](./troubleshooting#no-webgl2).

::: info How this page was checked
The import, the figure building and the errors on the server were run in Node. The Next.js and
Nuxt snippets have not been run in those frameworks yet.
:::
