---
title: Content Security Policy
description: The CSP directives Holochart needs for its text worker, fonts and DOM controls, a tested policy, and how to run under a policy without blob URLs.
status: complete
---

# Content Security Policy

Holochart runs under a strict Content Security Policy (CSP) with a few additions. It never uses
`eval` or inline scripts, so `script-src` needs neither `'unsafe-eval'` nor `'unsafe-inline'`.
What it does need comes from text rendering: chart text is typeset by
[troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text),
which starts a web worker from a `blob:` URL and loads font files itself.

## A working policy

For the npm packages built with a bundler, with every default left as it is:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' blob:;
  worker-src blob:;
  connect-src 'self' blob:;
  font-src 'self' blob:;
  style-src 'self' 'unsafe-inline'
```

Add `img-src 'self' data:` if your figures use `data:` images, and
`https://cdn.jsdelivr.net` to `connect-src` if your charts show text outside the Latin script
(see [below](#text-in-other-scripts)).

::: info Tested
The policy above and the [stricter one](#without-blob-urls) below were tested on a page served
with the policy as a `Content-Security-Policy` header, in Chromium and Firefox. The page drew a
chart with a title, axes, a legend, text labels, an annotation, the modebar and a hover label
with rich text, exported it as an image, and reported no violation. Each row of the table below
was tested in Chromium by leaving that directive out; the `img-src` row with `layout.images`,
and a 3D scene under the policy above. Safari was not tested.
:::

## What each directive is for

| Directive                   | Why Holochart needs it                                                                                                                                    | If it is missing                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `script-src blob:`          | The text engine typesets in a web worker. The worker is created from a `blob:` URL and loads its code with `importScripts` from `blob:` URLs.             | No text is drawn, and the promises of `newPlot` and `react` don't settle.               |
| `worker-src blob:`          | The same worker. Browsers fall back to `script-src` when a policy has no `worker-src`, so this matters when your policy sets `worker-src` itself.         | The same.                                                                               |
| `connect-src blob:`         | The built-in font is turned into a `blob:` URL, and the text engine fetches fonts with `XMLHttpRequest`.                                                  | The same.                                                                               |
| `font-src blob:`            | The same font is registered as a CSS font face, which Holochart measures text with.                                                                       | Text is drawn, but measured with a system font, so labels can be placed a bit off.      |
| `style-src 'unsafe-inline'` | The modebar, legend, sliders and range selector add `<style>` elements to the page; rich text in hover labels (`<span style="…">`) uses style attributes. | Charts draw, but these controls lose their styling: the modebar shows as plain buttons. |
| `img-src data:`             | Only for `data:` URIs in `layout.images`, `marker.image` and the `image` trace's `source`.                                                                | Those images are not drawn; a warning is logged.                                        |

Where the table says no text is drawn, the rest of the chart is: lines, markers, bars, grid
lines and legend symbols appear, without titles, tick labels or legend names. Because
`newPlot` waits for the text of the first frame, its promise stays pending. The browser logs the
blocked worker and font in the console; requests blocked inside the worker (a missing
`script-src blob:` or `connect-src blob:`) show up as `importScripts` or "Failure loading font"
errors instead of CSP reports.

`data:` is not needed for fonts. The built-in font ships as base64 inside the JavaScript bundle
and is converted to a `blob:` URL in the page; nothing is loaded from a `data:` URL.

## Without blob URLs

If your policy cannot allow `blob:`, turn the worker off and serve the built-in font's files
yourself. Text is then typeset on the main thread.

Copy the four `.otf` files and `GUST-FONT-LICENSE.txt` from
`node_modules/@mk7s/holochart/dist/fonts/` to your site, then configure text before the first
chart is created:

```ts
import { render } from '@mk7s/holochart';

render.configureText({
  useWorker: false,
  defaultFontFaces: {
    regular: '/fonts/texgyreheros-regular.otf',
    bold: '/fonts/texgyreheros-bold.otf',
    italic: '/fonts/texgyreheros-italic.otf',
    boldItalic: '/fonts/texgyreheros-bolditalic.otf',
  },
});
```

With that, this policy is enough:

```text
Content-Security-Policy:
  default-src 'self';
  style-src 'self' 'unsafe-inline'
```

`configureText` applies to every chart on the page. Call it once, before any chart draws text:
the text engine reads its configuration when it typesets the first label and ignores later
changes.

`useWorker: false` alone removes the need for `blob:` in `script-src` and `worker-src`, but not
in `connect-src` and `font-src`; `defaultFontFaces` removes those.

## The script-tag build

`holochart.iife.min.js` loads the built-in font from the `fonts/` folder next to the script
instead of from the bundle, so it needs no `blob:` in `connect-src` or `font-src`. The policies
below were tested with the script and its `fonts/` folder served from the page's own origin.
Loaded from a CDN, the CDN's origin has to be in `script-src`, `connect-src` and `font-src`
(not tested).

The worker is the same. Either allow it:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' blob:;
  worker-src blob:;
  style-src 'self' 'unsafe-inline'
```

or turn it off with `Holochart.render.configureText({ useWorker: false })` before the first
chart, and `default-src 'self'; style-src 'self' 'unsafe-inline'` is enough.

## Your own fonts

A font registered with [`fonts.register`](/fundamentals/styling-themes#web-fonts) is requested twice: by
the text engine with `XMLHttpRequest`, and by the browser as a CSS font face. Fonts served from
your own origin are covered by `'self'`. A font on another origin needs that origin in both
`connect-src` and `font-src` (not tested).

## Text in other scripts

The built-in font covers Latin text. For characters it lacks, such as Cyrillic or CJK, the text
engine downloads a fallback font for that script from `https://cdn.jsdelivr.net`. Under a policy
that blocks it, a label with such characters is not drawn and the chart's promise stays pending,
as above.

Either add `https://cdn.jsdelivr.net` to `connect-src`, or avoid the download: register a font
that has the script and use it in the figure, as described in
[Locales](/fundamentals/locales). `render.configureText({ unicodeFontsURL })` points the
text engine at a self-hosted copy of the fallback fonts instead; that route has not been tested.

## Other things a policy can block

- **Images.** `layout.images` and `marker.image` load from the URLs you give them, so `img-src`
  has to allow those origins.
- **Image export.** `toImage` returns a `data:` URL and loads nothing. If you show the result in
  an `<img>`, your `img-src` has to allow `data:`.
- **Lazy chunks.** Holochart loads parts of itself on demand (the text engine, image export,
  animation) with `import()`. Bundlers emit them as files next to your own chunks, so
  `script-src 'self'` covers them.

See also [Troubleshooting](./troubleshooting#fonts-and-text).
