---
'@mk7s/holochart-render': patch
---

Charts created at the same time no longer show text with letters missing. The text engine keeps one glyph atlas for the page and reports a label as typeset as soon as its glyphs are registered; when another chart had asked for the same new glyphs a moment earlier, that was before they were in the texture, and the chart kept the gaps until something else redrew it ("Hourly precipitation (in)" read "ourl pre ipitation in"). Text primitives now watch the atlas together: when typesetting or `preloadTextFont` adds glyphs, every chart with text draws one more frame.
