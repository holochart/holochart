---
'@mk7s/holochart-render': patch
---

Text: `ready` now covers every default font face a new label set waits for. A text primitive created after the text engine had loaded attached it synchronously but dropped the promise of the font-face wait, so `ready` (and `chart.ready`, exports, visual tests) could resolve before bold or italic labels were typeset.
