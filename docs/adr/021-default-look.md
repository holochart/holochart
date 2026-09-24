# ADR-021: A dark, dense default look, applied by the runtime

- **Status:** Accepted
- **Date:** 2026-09-23
- **Deciders:** product owner; M2 default-look workstream
- **Related stories:** E8.1, E8.2, E8.3, E21.1, E22.2; plan §8 (customization cascade)

## Context

Until now a figure without `layout.template` rendered with Plotly's look: white paper and plot
area, `#444` text in Open Sans 12 px, the D3 category10 colorway, Plotly's margins (80/80/100/80)
and a vertical legend on the right. That is the right look for a Plotly clone, but not for
Holochart's audience (dashboards, monitoring, dense multi-panel views on dark UIs), and the product
owner decided, after reviewing rendered prototypes, that Holochart should have its own default:
dark, dense and legible at small sizes. Plotly's look must stay one line away.

Constraints:

- `core` is Plotly-semantics first (ADR-001): its schema defaults (`dflt`) are Plotly's, and
  core's property and unit tests, and anyone using `supplyDefaults` with their own registry, rely
  on them. The default look must not change what core does on its own.
- The look must apply in **every** bundle: the full `@mk7s/holochart` bundle and partial bundles
  (`@mk7s/holochart-runtime` + `register(scatter)`, E21.1), which do not include the themes
  package.
- The customization cascade (plan §8) must hold: a template sits above schema defaults and below
  everything the user sets.
- Core registries already support a default template (`setDefaultTemplate`, used by
  `resolveTemplate` when `layout.template` is unset), and runtime template modules can carry
  `default: true`.

## Decision

**The default look is a template named `holochart`**, applied when `layout.template` is unset.
Values (final, reviewed on rendered prototypes):

- Background `#0a0a0f` (paper and plot area), grid `#1a1a22`, axis lines and ticks `#2c2c38`,
  zero lines `#3e3e4c`, text `#a4a7b5`, tick labels `#80838f`, figure title `#eceef4`.
- Font `'Helvetica Neue', Helvetica, Arial, sans-serif` (drawn with the renderer's bundled
  TeX Gyre Heros unless one of these families is registered): 9 px text, legend and hover labels,
  8 px tick labels, 9 px axis titles, an 11 px figure title at the top left (`x: 0.01`, `y: 1`,
  `yanchor: 'top'`, `pad.t: 6`; `xanchor` stays `auto`, which resolves to `left` there and still
  centers a figure's own `title.x: 0.5`).
- Colorway: `#ea2a37`, `#5e74d5`, `#9962c0`, `#118e36`, `#cc540a`, `#128b8b`, `#997600`,
  `#b8267e`.
- Density: margins `{ l: 40, r: 16, t: 42, b: 32, pad: 0 }` with `automargin` on both axis
  families; outside ticks (`ticklen: 3`) with automatic spacing, `showline: true`, axis `title.standoff: 4`;
  a transparent horizontal legend just above the plot area on the left (`x: 0`, `y: 1`,
  `yanchor: 'bottom'`, `itemwidth: 30`, `tracegroupgap: 4`). `t: 42` fits the title above one
  legend row without either touching.
- Traces: scatter `line.width: 1.25`, `marker.size: 4`, `marker.line.width: 0` with background-colored
  outlines when a width is set (bubbles); bars without outlines and with `#80838f` error bars; pie slices separated by a 1 px background-colored line; slim colorbars (`thickness: 10`,
  no outline, 8 px tick labels, short outside ticks) on scatter, bar and `coloraxis`.
- Hover labels `#15151d` with a `#3e3e4c` border and `#eceef4` text; muted modebar icons;
  annotation arrows and text, and shape lines (1 px) in the text color.
- Colorscales, all following one rule on a dark background, **brighter means further from
  zero** (the inverse of Plotly's light-background rule, where more ink means more):
  - `sequential`: the "neon plasma" ramp
    `[[0,'#3a0ca3'],[0.3,'#6a00f4'],[0.6,'#ff2bd6'],[0.85,'#ff9e00'],[1,'#f9f871']]`. The low end
    is a violet that still shows on the background, so the lowest values don't vanish.
  - `sequentialminus` (all-negative data): a cool mirror of it, pale cyan at the most negative
    value fading to a dark blue at zero that still shows on the background
    (`#c8f7ff → #3fd0e0 → #2f7de1 → #2a1a8f → #1f2a6b`). Plotly's `Blues` puts dark at the most
    negative value, which on a dark page would hide the largest magnitudes; the cool hue keeps
    negative-only data distinguishable from positive-only data at a glance.
  - `diverging`: a muted neutral midpoint `#4b475c` (clearly lighter than the background, so values
    near zero stay visible) with blue → cyan for negative and magenta → orange for positive values, both ends
    about equally bright (`#6fe3ff, #2f7de1, #4b475c, #ff2bd6, #ff9e00`). RdBu's white midpoint
    would make the least interesting values the most prominent and glare on a dark page.

**Where it lives.** The template data is in core (`packages/core/src/templates/builtin.ts`, exported
as `holochartTemplate` with `HOLOCHART_COLORWAY`, `HOLOCHART_FONT_FAMILY` and
`DEFAULT_TEMPLATE_NAME`), next to `plotlyClassicTemplate` and `noneTemplate`. Core only defines
them: `createRegistry()` has no templates and no default, so `supplyDefaults` stays Plotly-pure.

**Who applies it.** The runtime's shared `registry` (`packages/runtime/src/registry.ts`) is created
with three template modules, `holochart` (`default: true`), `plotly-classic` and `none`. Every
chart that is not given its own registry uses the shared one, so the full bundle and every partial
bundle get the default look, and `plotly-classic` / `none` resolve without the themes package.
`createChartRegistry()` stays empty (no templates, no default), for tests and for apps that want
full control.

**Plotly's look.** The former `holochart` theme (the schema defaults spelled out) is renamed
`plotly-classic`. `layout.template: 'plotly-classic'`, `'none'` or `null` render exactly what
Holochart rendered before this ADR (the bundle test compares the defaulted figure with a snapshot
recorded before the change). To make it the default everywhere:

```ts
import { setDefaultTemplate } from '@mk7s/holochart'; // or '@mk7s/holochart-runtime'
setDefaultTemplate('plotly-classic'); // once, before creating charts
```

`setDefaultTemplate(name | undefined)` sets the shared registry's default (`undefined` applies
none, which is also Plotly's look); `ChartRegistry.setDefaultTemplate` does the same for any
registry. Both warn when the name is not registered. The change applies from each chart's next
render.

**`holochart-dark`** is kept as a deprecated alias of `holochart` (the default is now dark, so a
separate dark variant has no purpose). Figures and examples that name it keep resolving, without
an "unknown template" warning; it is removed before 1.0.

**Precedence (plan §8).** Unchanged: the default template is layer 2. Any value the user sets in
the layout or a trace wins; an explicit `layout.template` replaces the default (it is not composed
with it), exactly as in Plotly, where `layout.template` replaces `plotly.io.templates.default`.

The themes package re-exports core's objects (`themes.holochart`, `themes.plotlyClassic`,
`themes.none`), so registering `builtinThemes` into the shared registry is a no-op for them. The
runtime now treats two template modules with the same name and the same template object as one
registration (no duplicate warning).

Template validation now accepts `<itemName>defaults` keys (`annotationdefaults`,
`shapedefaults`, …), checking them against the item schema; before, they were reported as unknown
attributes although templates have always applied them.

## Consequences

### Positive

- Every Holochart chart looks like Holochart out of the box, in every bundle, with no setup.
- Core keeps Plotly's defaults, so core tests, custom registries and the attribute reference
  (whose `dflt` values are Plotly's) are unaffected; the look is one ordinary template, inspectable
  (`fullLayout.template`) and overridable attribute by attribute.
- Migrating apps get Plotly's look back with one call, and partial bundles can name
  `plotly-classic` / `none` without the themes package.

### Negative

- **Plotly migrations look different by default.** A plotly.js figure rendered by Holochart
  without `layout.template` gets the dark look: other background, fonts, colorway (8 colors instead
  of 10, so trace colors differ from the third trace on), margins, legend position, line widths,
  marker sizes and automatic colorscales. Figures that set these explicitly keep them. Apps that
  must match Plotly set `setDefaultTemplate('plotly-classic')` (or `layout.template` per figure).
  The Plotly figure JSON itself is unaffected: `chartToJSON` exports the user's figure, not the
  template.
- The documented schema defaults (`dflt` in the attribute reference) are no longer what an
  unstyled chart shows; the docs have to say that the `holochart` template sits on top.
- Every visual baseline changes (examples use the full bundle), and interaction tests that rely
  on default colors or legend placement must set them explicitly.
- About 0.9 kB gzipped more in every bundle (the template data and registry code; measured on the
  `core + scatter` partial).
- The title and a legend that wraps to two or more rows can overlap: margins grow by the larger of
  the two pushes, not their sum, so `margin.t: 42` only fits one legend row under the title. Long
  legends need `legend.y`, `margin.t` or a vertical legend (`legend.orientation: 'v'`).

### Follow-ups

- Docs: themes and styling pages (default look, `plotly-classic`, `setDefaultTemplate`, the
  deprecated `holochart-dark`), a migration note for Plotly users, the attribute reference's note
  on template defaults; a changeset (a visible change for every user).
- Examples: a `themes/plotly-classic` sampler; `themes/holochart-dark` now duplicates
  `themes/holochart` and can go with the alias.
- Regenerate every visual baseline.
- Stacked title/legend placement (sum the pushes of top-anchored components) would remove the
  multi-row overlap.
- Trace packages that add colorscaled trace types (heatmap, contour, …) add their slim colorbar
  defaults to the `holochart` template.

## Alternatives considered

### Change core's schema defaults

Make the dark values the `dflt` of each attribute. Rejected: it breaks Plotly semantics (ADR-001)
in core itself, rewrites dozens of `dflt`s scattered through core, components and traces (the
colorscale and colorbar defaults cannot all be expressed as independent `dflt`s), and would make
`plotly-classic` a template that overrides every one of them, fragile to keep exact.

### Keep the look in the themes package, registered by the full bundle

The bundle would call `setDefaultTemplate('holochart')` after `register(...builtinThemes)`.
Rejected: partial bundles (runtime + one trace package) would silently fall back to Plotly's look,
so the same figure would look different depending on how Holochart was imported.

### Compose explicit templates with the default

Apply the default under any named template (`'plotly_dark'` = `holochart+plotly_dark`). Rejected:
Plotly replaces the default when a template is named, and composition would leak dark values
(margins, legend placement, fonts) into every other theme.

### Remove `holochart-dark`

Cleaner, but existing figures and the `themes/holochart-dark` example would start warning and fall
back to Plotly's look. A deprecated alias costs one line.

## References

- `plan.md` §8, E8.1–E8.3, E21.1, E22.2
- [ADR-001](001-figure-spec-plotly-semantics.md), [ADR-019](019-runtime-package.md)
- `packages/core/src/templates/builtin.ts`, `packages/runtime/src/registry.ts`,
  `packages/themes/src/holochart.ts`
