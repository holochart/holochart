---
title: JavaScript & TypeScript quick start
description: Create a complete browser page, render a line and bar chart, update its data, and release its GPU resources.
status: complete
---

# JavaScript & TypeScript quick start

Build one page with a line, bars and two controls. **Update visits** changes the line without
recreating the chart; **Dispose chart** releases it. The chart steps take about five minutes
after the one-time source setup.

<InstallStatus ecosystem="javascript" />

## 1. Build the source workspace

You need Git, Node.js 22+, pnpm 11.15.1 and a browser with WebGL2. Follow the
[source installation](/getting-started/installation#build-from-source-today), including the
clone, `pnpm install` and `pnpm build:packages`. Keep your terminal in that repository root.
The existing Vite sandbox provides the bundler. Add the full package as an explicit local
workspace dependency, since the sandbox's existing example loader otherwise resolves it through
the examples package:

```sh
pnpm --filter @mk7s/holochart-sandbox add '@mk7s/holochart@workspace:*'
```

This links the package from your checkout; it does not install Holochart from a registry.
These examples use public browser APIs and local built-in data.

## 2. Create the page

Save this **new file** as `apps/sandbox/quickstart.html`. Its module points to the file in the
next step. The explicit 400-pixel container height is required; width fills the page.

<<< @/public/quickstarts/browser.html

## 3. Create and update the chart

Save this **new file** as `apps/sandbox/src/quickstart.ts`. The source uses JavaScript-compatible
syntax; `.ts` adds Holochart's TypeScript checking. To use `.js`, rename the file and change
the script's URL in the HTML to `/src/quickstart.js`.

<<< @/public/quickstarts/browser.ts

Every value needed to reproduce the figure is in this file. `chart.ready` resolves after the
first frame. `chart.update(..., { traces: [0] })` targets only the line; the bar values remain
`[2, 2, 3, 1, 4]`. `responsive: true` follows container size changes. Cleanup removes the control
listeners and calls `destroy()` on disposal or page exit.

## 4. Run and inspect

In the repository-root terminal:

```sh
pnpm dev
```

Open the Vite URL printed in the terminal, then append **`/quickstart.html`**. The initial result
matches this live chart:

<Example id="line/with-bars" />

Click **Update visits**: the line's final point becomes 6 and the status text confirms the
update. Click **Dispose chart**: the chart canvas disappears. Reload the page to create it
again. Stop the development server with Ctrl+C.

If rendering fails, check the console and [WebGL2 troubleshooting](/guides/troubleshooting).
When an application removes its chart view, always destroy the chart; hiding its container
alone does not release GPU resources.

## Continue

- [Plain HTML](/getting-started/html) uses the locally built script bundle without Vite.
- [Figures, layout and config](/getting-started/core-concepts) explain the figure model.
- [Plotly migration](/getting-started/from-plotly) reuses supported JavaScript figure data.
- [TypeScript Express](/express/) creates browser figures from tables; Python's
  [`plotly.express`](/python/plotly) uses a separate API.
