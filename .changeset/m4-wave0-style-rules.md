---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart': minor
---

Conditional styling: `styleRules` on every trace sets per-point attributes from conditions on the point's data, as plain JSON (`[{ when: { y: { gt: 10 }, 'customdata[1]': { in: ['A', 'B'] } }, set: { 'marker.color': 'gold', 'marker.size': 14 } }]`; operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `between`, `regex`, `and`, `or`, `not`; later rules win, other points keep the trace's own value), and style functions (`marker: { color: (point, i, trace) => … }`) work on every per-point (`arrayOk`) attribute of every trace type. Both resolve to per-point arrays before the trace sees the data (typed arrays for numbers, cached across updates that don't touch the trace); a rules change that sets only styles restyles without recomputing, transitions interpolate between what the rules give, invalid rules are reported with suggestions (strict mode rejects), and `toJSON()` keeps rules while evaluating functions into arrays with one warning per attribute. The code loads the first time a trace uses a rule or a function. New types `StyleRule`, `StyleCondition`, `StyleOperators`, `StylePoint`, `StyleFunction`; `pointSource` gives the points style functions receive.
