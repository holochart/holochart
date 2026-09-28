---
'@mk7s/holochart-core': patch
---

`supplyDefaults` fixes found by the nightly property run (the full output fed back in reproduces it, and is valid input):

- Matched axes (`matches`): `rangebreaks` set on an axis other than the group's root are resolved against the root's template, as if set on the root. Template range breaks named only in the other axis' template no longer turn into hidden, dangling `templateitemname` items, and the root's named template range breaks apply to the whole group.
- Range slider thumbnails (`xaxis.rangeslider.yaxis<N>`): a partial `range` (`[]`, `[null, 1]`) no longer hides the template's full range.
- Font sizes scaled from `layout.font.size` (`layout.title.font`: 1.4×, axis titles: 1.2×) are capped at the largest finite number instead of overflowing to `Infinity` for huge sizes.
