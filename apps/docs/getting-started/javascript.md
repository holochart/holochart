---
title: JavaScript & TypeScript quick start
description: Create a complete browser page, render a line and bar chart, update its data, and release its GPU resources.
status: complete
---

# JavaScript & TypeScript quick start

Build one page with a line, bars and two controls. **Update visits** changes the line without
recreating the chart; **Dispose chart** releases it. The chart steps take about five minutes
once the packages are installed.

<InstallStatus ecosystem="javascript" />

## 1. Start a project and install from npm

You need Node.js with npm and a browser with WebGL2. In a terminal, create an empty project,
then install Holochart, three.js and Vite:

```sh
mkdir holochart-quickstart
cd holochart-quickstart
npm init -y
npm install @mk7s/holochart@0.1.0-alpha.0 three@0.186.0
npm install --save-dev vite@8
```

The Holochart version is exact because Holochart is in alpha. `three` is a
[peer dependency](/getting-started/installation#why-three-is-a-peer-dependency), so it is
installed beside Holochart. Vite is the development server and bundler for this tutorial. Keep
the terminal in `holochart-quickstart/` for the steps below. These examples use public browser
APIs and local built-in data.

In an app that already has a bundler, run only the line that installs `@mk7s/holochart` and
`three`, and add the two files below to that app. Contributors working in a clone of the
repository use [the monorepo sandbox](/getting-started/installation#try-it-from-the-monorepo)
instead.

## 2. Create the page

Save this **new file** as `index.html` in the project directory. Its module points to the file
in the next step. The explicit 400-pixel container height is required; width fills the page.

<<< @/public/quickstarts/browser.html

If the app already has an `index.html`, save this page as `quickstart.html` beside it.

## 3. Create and update the chart

Create a `src` directory and save this **new file** as `src/quickstart.ts`. The source uses
JavaScript-compatible syntax; in `.ts`, an editor with TypeScript support checks the figure
against Holochart's types. To use `.js`, rename the file and change the script's URL in the HTML
to `/src/quickstart.js`.

<<< @/public/quickstarts/browser.ts

Every value needed to reproduce the figure is in this file. `chart.ready` resolves after the
first frame. `chart.update(..., { traces: [0] })` targets only the line; the bar values remain
`[2, 2, 3, 1, 4]`. `responsive: true` follows container size changes. Cleanup removes the control
listeners and calls `destroy()` on disposal or page exit.

## 4. Run and inspect

In the project directory:

```sh
npx vite
```

Open the local URL printed by Vite. If you saved the page as `quickstart.html`, append
**`/quickstart.html`** to that URL. The status text reads **Chart ready. Click Update visits.**
and the chart matches this live one:

<Example id="line/with-bars" />

Click **Update visits**: the line's final point becomes 6 and the status text confirms the
update. Click **Dispose chart**: the chart canvas disappears. Reload the page to create it
again. Stop the development server with Ctrl+C.

If rendering fails, check the console and [WebGL2 troubleshooting](/guides/troubleshooting).
When an application removes its chart view, always destroy the chart; hiding its container
alone does not release GPU resources.

## Continue

- [Plain HTML](/getting-started/html) loads the script-tag build from a CDN, without a bundler.
- [Figures, layout and config](/getting-started/core-concepts) explain the figure model.
- [Plotly migration](/getting-started/from-plotly) reuses supported JavaScript figure data.
- [TypeScript Express](/express/) creates browser figures from tables; Python's
  [`plotly.express`](/python/plotly) uses a separate API.
