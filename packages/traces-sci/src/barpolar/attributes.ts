/**
 * `barpolar` attribute schema (plan E11.5, ADR-002), following plotly.js
 * `traces/barpolar/attributes.js`: `r` / `theta` like scatterpolar, the bar extent (`base`,
 * `offset`, `width`) and bar's marker and selection styles (without `cornerradius`; with
 * `marker.pattern`, E8.10).
 */
import { attr } from '@mk7s/holochart-core';
import { barAttributes } from '@mk7s/holochart-traces-basic';
import { polarCoordinateAttributes, polarHoverinfo } from '../scatterpolar/attributes.ts';

const B = barAttributes.children;

export const barpolarAttributes = /* @__PURE__ */ (() => {
  const { cornerradius: _, ...marker } = B.marker.children;
  return attr.object(
    {
      ...polarCoordinateAttributes,
      base: attr.any({
        arrayOk: true,
        editType: 'calc',
        description:
          'Where bars start, in radial axis units (default 0). In `stack` barmode, traces that set `base` are not stacked: they are drawn from their base, as in `overlay` mode.',
      }),
      offset: attr.number({
        arrayOk: true,
        editType: 'calc',
        description:
          'Angular shift of the leading edge of each bar from its `theta` (in `thetaunit`; category slots on category axes). Default: centered.',
      }),
      width: attr.number({
        min: 0,
        arrayOk: true,
        editType: 'calc',
        description:
          'Angular width of each bar (in `thetaunit`; category slots on category axes). Default: the smallest angle between bars, less `polar.bargap`.',
      }),
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'style',
        description: 'Hover text of each bar (one string for all, or one per bar).',
      }),
      marker: attr.object(marker, { editType: 'calc', description: 'Bar style.' }),
      hoverinfo: polarHoverinfo,
      selected: B.selected,
      unselected: B.unselected,
    },
    {
      editType: 'calc',
      description:
        'Bars in polar coordinates: annular sectors from `base` to `base + r` at angle `theta`, stacked or overlaid per `polar.barmode` (wind roses).',
    },
  );
})();
