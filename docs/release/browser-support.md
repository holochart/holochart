# Browser support

Holochart draws with WebGL2 and nothing else: there is no SVG, Canvas 2D or WebGL1 fallback (a
non-goal). A browser without WebGL2 gets `WebGLUnavailableError` and a text fallback, never a
chart. This page says which browsers are tested, how, what is known to differ, and what to check
by hand before a release.

## Matrix

"Automated" means Playwright's build of the engine, headless. Playwright's WebKit is not Safari:
it shares WebCore and the WebGL implementation, not the system text stack, the touch handling of
iOS or Safari's settings. The version columns are what was run, not minimum versions: no minimum
versions have been established.

| Browser                          | Status                | How it is tested                                                                                     |
| -------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| Chrome, Edge (Chromium), desktop | Supported, tested     | Every PR: unit, visual, interaction, bundle and package suites on headless Chromium with software GL |
| Firefox, desktop                 | Supported, tested     | Nightly: interaction and bundle suites on Playwright's Firefox; [known issues](#known-issues) F1, F2 |
| Safari, macOS                    | Supported, not tested | Nightly: interaction and bundle suites on Playwright's WebKit, known issue W1; real Safari by hand   |
| Safari, iOS and iPadOS           | Supported, not tested | By hand only ([checklist](#manual-pass))                                                             |
| Chrome, Android                  | Supported, not tested | By hand only; touch gestures are covered on desktop Chromium with injected touch events              |
| Firefox, Android                 | Not tested            |                                                                                                      |
| Any browser without WebGL2       | Not supported         | `tests/bundle/iife-no-webgl.spec.ts`: `newPlot` rejects with `WebGLUnavailableError`, fallback shown |

"Supported, not tested" is the project's claim (any browser with WebGL2), without a run on that
browser to back it yet.

### What was run

Local runs on macOS 26 (Apple silicon), headless, with `@playwright/test` 1.63.0, on 2026-10-02.
Counts are for the suites as they were that day, without `leak.spec.ts` (see
[Leak test](#leak-test)); the WebKit run had two more tests than the Firefox run
(`containers.spec.ts` was added in between). "fixme" are the known issues below.

| Engine                              | WebGL2                               | Interaction suite             | Bundle suite     |
| ----------------------------------- | ------------------------------------ | ----------------------------- | ---------------- |
| Chromium 153 (SwiftShader)          | yes, software (ANGLE on SwiftShader) | the PR baseline               | the PR baseline  |
| Firefox 155 (Playwright build 1543) | yes, on the GPU ("Apple M1")         | 239 pass, 10 skipped, 1 fixme | 16 pass, 2 fixme |
| WebKit 26.6 (Playwright build 2359) | yes, on the GPU ("Apple GPU")        | 241 pass, 10 skipped, 1 fixme | 18 pass          |

Not verified: the same suites on Linux, where the nightly workflow runs them
(`mcr.microsoft.com/playwright:v1.63.0-noble`, no GPU). Headless Firefox needs
`webgl.force-enabled` there, which `tests/browsers.ts` sets; whether Playwright's Linux WebKit
gives a WebGL2 context without a GPU has not been checked. The first nightly run answers it. If
WebKit has no WebGL2 there, move its legs to a `macos-latest` runner.

### How to run them

```sh
pnpm exec playwright install firefox webkit
HOLOCHART_BROWSER=firefox pnpm test:interaction
HOLOCHART_BROWSER=webkit pnpm test:bundle
```

`HOLOCHART_BROWSER` (`chromium`, `firefox`, `webkit`; `tests/browsers.ts`) picks the one browser
a run uses. Without it, and in PR CI, that is `chromium-swiftshader`. The nightly workflow is
`.github/workflows/browsers-nightly.yml`. The visual suite compares pixels against SwiftShader
baselines and stays Chromium-only.

### Tests that skip outside Chromium

These are limits of the test harness or of the browser's API, not of Holochart.

- **Multi-step touch gestures** (10 tests: `touch.spec.ts` pinch, two-finger pan, swipes, select
  drag, sankey drag; the touch tests of `legend-scroll`, `polar` and `scene`). They inject touches
  with the DevTools protocol (`Input.dispatchTouchEvent`), which only Chromium has. Taps
  (`page.touchscreen.tap`) run and pass on all three. Real touch is on the manual checklist.
- **The heap part of the leak test**: forced GC and the live-object census use the DevTools
  protocol. The GPU, context, DOM and listener counts run on all three.

Two tests behave differently per browser instead of skipping:

- `export.spec.ts` "encodes JPEG and WebP": WebKit's canvas has no WebP encoder (neither has
  Safari), so there `toImage({ format: 'webp' })` must reject with "this browser cannot encode
  webp". PNG and JPEG work.
- `axes.spec.ts` "zoom and pan across range breaks": Firefox and WebKit deliver pointer positions
  rounded to whole pixels, Chromium fractional ones, so the pan distance is checked to a pixel
  there instead of to a hundredth.

Harness fix found on the way: Playwright's WebKit sends `blob:` URLs through `page.route`, and the
bundle tests answered them with 404, which stopped the text engine's worker and left `chart.ready`
pending. The routes now let `blob:` through. (Product note: a chart whose text worker cannot start
never resolves `ready`; that is not specific to a browser and is not covered by a test.)

## Known issues

Real differences found by the runs above. Each is `test.fixme` for that browser only, so the
nightly run stays meaningful; remove the annotation with the fix.

**F1. Firefox: shader link warning for the mesh program.** On Firefox (macOS, GPU) linking the
`holochart:mesh` program logs

```
THREE.WebGLProgram: Program Info Log: WARNING: Output of vertex shader 'webgl_…' not read by fragment shader
```

through `console.warn`: some variant of the fragment shader does not read a varying the vertex
shader writes. The scene draws correctly. Seen with `mesh3d`, extruded 2.5D bars and 3D pies.
Tests: `tests/bundle/iife-3d.spec.ts` "3D add-on draws a scene…" and "3D pies come with the 3D
add-on" (both assert that nothing is logged), `tests/interaction/context-loss.spec.ts` "every
chart draws the same frame…".

**F2. Firefox: shadow-map filtering warning.** A scene with `castshadow` logs

```
WebGL warning: drawElementsInstanced: Depth texture comparison requests (e.g. `LINEAR`) Filtering, but behavior is implementation-defined, and so on some systems will s…
```

The shadows draw, and the frames before and after a context restore match. Test:
`tests/interaction/context-loss.spec.ts` "every chart draws the same frame…" (which also sees
Firefox's own "WebGL context was lost." warning, not matched by the test's filter).

**W1. WebKit: range selector buttons are not tab stops.** The range selector's `<button>`s have
no `tabindex`. WebKit, like Safari with its default settings, only tabs to buttons that have one,
which the legend, modebar, update menus and sliders set. Tab therefore leaves the chart after the
toolbar instead of reaching "3m" and "All". Test: `tests/interaction/keyboard.spec.ts` "controls
are reachable in the documented tab order" (focus order ends at the toolbar; the next stop is
outside the chart).

## Leak test

`tests/interaction/leak.spec.ts` creates, updates and destroys every chart family (22 families
covering every registered trace type), on a context of its own and on the shared renderer, and
checks that GPU resources, WebGL contexts, DOM nodes, listeners, observers and (Chromium) live
objects return to where they were. PR CI runs 10 rounds per family (`LEAK_CYCLES=10`); the nightly
workflow runs 100 on all three browsers. All 45 tests pass on Chromium, Firefox and WebKit, with
the same counts on each.

Leaks it found that are still open are in the spec's `KNOWN_LEAKS`, as the exact growth per round
the test expects until they are fixed:

- **L1.** Each destroyed chart with its own context leaves a `dispose` listener on the page-wide
  glyph atlas texture, which keeps that chart's lost WebGL context and canvas in memory (about
  25 kB per chart). **L1b:** a 3D scene with lit materials does the same through three's DFG
  lookup texture, which keeps the whole renderer.
- **L2.** On any renderer, a text batch that changes length orphans one small GL buffer (troika's
  `BatchedText`). It goes with the context on a dedicated chart and accumulates on the shared
  renderer.

## Manual pass

Before a release, on real **Safari (macOS)**, **Safari (iOS or iPadOS)** and **Firefox
(desktop)**. Use the docs site or `pnpm dev` (on a phone: `pnpm dev --host`, then the machine's
address). Note the browser and OS version with the result. The example ids are for the sandbox
(`?example=<id>`).

Text

- [ ] `_dev/text-labels` and `scatter/basic`: titles, tick labels, legend and annotations are sharp at the
      device's pixel ratio, not blurry or doubled, and sit where they do in Chrome.
- [ ] `_dev/text-default-font`, `_dev/text-registered-font`: the built-in font and a registered
      font both draw; nothing falls back to a system font.
- [ ] `_dev/richtext-components`: bold, italic, sub/superscript and line breaks.
- [ ] Pinch-zoom the page (iOS) or change the browser zoom: text re-renders sharp.
- [ ] The console shows no errors about workers or fonts (the text engine runs in a worker
      started from a `blob:` URL).

Lines and markers

- [ ] `_dev/lines-joins-dashes`: joins, caps and dash patterns; thin (1 px) and wide lines.
- [ ] `_dev/markers-symbols`: every symbol, with outlines; no clipped or square markers.
- [ ] `_dev/fills-polygons` and the `area/` examples: fill edges meet the line; no gaps at high pixel ratios (3× phones).
- [ ] `_dev/markers-1m` or `_dev/timeseries-2m6`: draws, pans and zooms without the tab reloading
      (iOS memory limit).

3D

- [ ] `scatter3d/basic`, `surface/basic`, the `mesh3d/` examples: draw with lighting; rotate, zoom and pan
      with mouse or trackpad.
- [ ] `_dev/scene-lighting`: shadows and the environment map (Firefox: see F2).
- [ ] `volume/basic`, `isosurface/basic`: 3D textures draw (not black).
- [ ] Hover a 3D point: the label names the right point (GPU picking).
- [ ] `_dev/interaction-dashboard` (40 charts): every chart draws, none goes blank (context
      budget; iOS keeps fewer contexts than desktop).
- [ ] Put the tab in the background for a minute, open other WebGL tabs, come back: charts
      redraw (context loss and restore).

Touch (iOS, iPadOS; a touch laptop for Firefox)

- [ ] Tap a point: hover label; tap elsewhere: it hides. Tap a legend item: it toggles.
- [ ] Pan mode: one finger pans. Zoom mode: a sideways drag draws the zoom box, a vertical swipe
      scrolls the page.
- [ ] Two fingers: pinch zooms around their midpoint; moving together pans.
- [ ] 3D: one finger rotates, pinch zooms, two fingers pan; the page does not scroll or zoom
      with it.
- [ ] A long legend scrolls with a finger without toggling items.
- [ ] Sliders and update menus work by touch.
- [ ] Rotate the device: the chart resizes.

Export

- [ ] Modebar camera: a PNG downloads (iOS: opens or goes to Files) at the configured scale.
- [ ] `chart.toImage({ format: 'jpeg' })` returns a JPEG.
- [ ] `chart.toImage({ format: 'webp' })`: an image on Firefox; on Safari a rejection that says
      the browser cannot encode WebP.
- [ ] An export of a 3D scene and of a chart on the shared renderer (chart 5 of
      `_dev/interaction-dashboard`) is not blank.
- [ ] A large export (`scale: 4`) either works or fails with a clear error, not a blank image.

Keyboard and accessibility (Safari and Firefox on desktop)

- [ ] Tab into a chart: the focus ring shows; arrow keys move between points and announce them.
- [ ] Tab order through legend, menus, slider, toolbar and range selector (Safari: see W1).
- [ ] VoiceOver (Safari) reads the chart summary.
