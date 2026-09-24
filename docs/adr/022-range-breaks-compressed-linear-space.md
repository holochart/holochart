# ADR-022: Range breaks compress an axis' linear space

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** M3 wave 1 axes workstream
- **Related stories:** E3.8, E3.1, E16.4; plan §4.3; ADR-008, ADR-019

## Context

`rangebreaks` (E3.8) hide spans of a date or linear axis (weekends, nights, holidays): the axis
skips them, so the mapping from data to pixels is piecewise linear. Plotly keeps its linear space
(`l`, ms on date axes) unchanged and makes `l2p`/`p2l` piecewise over the breaks inside the visible
range (`set_convert.js`), recomputed on every `setScale`.

Holochart cannot do that cheaply. Traces upload linear coordinates to the GPU once (relative to a
per-trace origin, E16.4) and draw them through an affine per-subplot `DataTransform`; a zoom or pan
only changes that transform's uniforms (ADR-008, ADR-019). The scale contract (core
`scales/types.ts`) promises that every axis type is affine from linear space to pixels, and
autorange padding, hover distances, zoom boxes and selection all rely on it. A piecewise transform
would need a break table in every vertex shader of every primitive, or a re-upload on every pan.

## Decision

We will give an axis with range breaks a **compressed linear space**: `l = raw − (total length of
the breaks between raw 0 and raw)`, where raw is ms since the epoch (UTC) on date axes and the
number on linear axes. Each break has zero width in that space.

- Core builds a `BreakMap` from the defaulted `rangebreaks` (`createBreakMap`, `scales/breaks.ts`):
  analytic `toLinear` / `toRaw` (periodic `day of week` / `hour` patterns folded into one week,
  finite spans and `values` as sorted gaps with prefix sums), O(log n) and allocation-free.
- `createScale({ breaks })` applies it inside the scale: `d2l` / `d2lArray` compress data and give
  NaN for data inside a break (Plotly's `maskBreaks` drops those points); `r2l` compresses range
  values without masking; `l2d` / `l2r` expand back to raw before formatting. `l2p`, `p2l` and
  `affine()` are unchanged: the axis is still affine from linear space to pixels.
- Ticks are generated on the raw scale (`rawScale`) as in Plotly, moved out of breaks, thinned,
  labelled from the moved raw values, and converted to linear space. Hover formatting expands
  linear values first.
- The runtime rebuilds a scale when its break map's `key` changes (every trace on the axis then
  re-runs calc) and reports raw values in `fullLayout.<axis>.range`, so they stay valid range
  values.

Traces, the GPU transform, autorange, hover, zoom, pan and selection need no change: they all work
in linear space.

## Consequences

### Positive

- Breaks cost nothing per frame: panning and zooming stay transform-only, with no shader or buffer
  changes, for every existing and future trace type.
- Every trace type supports breaks without code of its own.
- A zoom or pan across a break moves by trading time, not calendar time, which is what users of
  such axes expect.

### Negative

- Linear coordinates on a breaks axis no longer equal ms. Code that did date arithmetic on linear
  values must go through the scale: `x0` + `dx` series, `xperiod` alignment and bar widths in data
  units are computed in compressed space, so they are not exact across a break (documented).
- The whole data set is converted again (a calc) when the breaks change, e.g. a single-span break
  that stops applying because the fixed range no longer encloses it.
- Plotly's `fullLayout` ranges are strings; ours stay numbers (raw ms), as before breaks.

### Follow-ups

- Traces that step in data units (`x0`/`dx`, periods, bar `width`) can compute in raw space and
  call `toLinear`, if exactness across breaks matters.
- Spike labels and a configurable display timezone (`layout.timezone`, E3.5) will need patterns in
  that timezone.

## Alternatives considered

### Piecewise transform in the shaders

Upload a break table as uniforms and map linear to pixels piecewise in every vertex shader. Keeps
Plotly's linear space, but every primitive (and third-party primitive) needs the code, lines and
fills crossing a break need extra vertices at the break edges, and the table must be sized for
periodic breaks across the visible range, which changes on every pan.

### Re-upload on pan and zoom

Keep linear = raw and convert to a range-dependent compressed space on the CPU whenever the range
changes (Plotly's approach, since it re-renders SVG anyway). Correct but it makes every pan of a
large series O(n) with buffer uploads, losing the transform-only fast path (ADR-007, E6.2).

## References

- `plan.md` E3.8, E3.1, §4.3; plotly.js `plots/cartesian/set_convert.js` (`maskBreaks`,
  `locateBreaks`, `setScale`), `axes.js` (`calcTicks`, `moveOutsideBreak`)
- [ADR-008](008-pixel-space-orthographic-2d-camera.md), [ADR-019](019-runtime-package.md)
