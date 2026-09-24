/**
 * `histogram` attribute schema (plan E10.1, ADR-002), following plotly.js' histogram attributes:
 * the samples (`x` or `y`), binning (`nbinsx`, `xbins`, `bingroup`), aggregation (`histfunc`,
 * `histnorm`, `cumulative`) and bar styling shared with `bar` (labels, `marker`, error bars,
 * `offsetgroup` / `alignmentgroup`, selection styles).
 *
 * Deferred: `xbins.adaptive` (rebinning on zoom, P2), `marker.pattern`, calendars.
 */
import { attr } from '@mk7s/holochart-core';
import { barAttributes } from '@mk7s/holochart-traces-basic';

const samples = (letter: 'x' | 'y') =>
  attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `Samples binned along ${letter} (${letter === 'x' ? 'vertical' : 'horizontal'} bars when only \`${letter}\` is given): numbers, dates or category names depending on the axis type. With both \`x\` and \`y\`, the coordinate across the bars is what \`histfunc\` aggregates.`,
  });

/** `xbins` / `ybins`. */
function binAttributes(letter: 'x' | 'y') {
  return attr.object(
    {
      start: attr.any({
        editType: 'calc',
        description: `First bin edge along ${letter}. Default: the data minimum moved down to a round value, off the data (integer data in bins of 5 starts at -0.5, so 0–4 fall in the first bin). A date string on date axes, a category index (e.g. \`-0.5\`) on category axes. In a bin group, the first explicit start wins and the other traces' starts are moved down onto its bin grid.`,
      }),
      end: attr.any({
        editType: 'calc',
        description: `Where binning stops along ${letter}: bins are added from \`start\` by \`size\` until one reaches or passes \`end\`. Default: the data maximum.`,
      }),
      size: attr.any({
        editType: 'calc',
        description: `Bin width along ${letter}. Default: a round size giving about as many bins as samples per bin (with \`nbins${letter}\`: at most that many bins). On date axes, ms or \`'M<n>'\` for months (\`'M1'\`, \`'M3'\` quarters, \`'M12'\` years); on category axes, the number of categories per bin (default 1).`,
      }),
    },
    {
      editType: 'calc',
      description: `Bins along ${letter}. Unset parts are automatic; traces of one \`bingroup\` share them.`,
    },
  );
}

/** The histogram schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const histogramAttributes = /* @__PURE__ */ (() => {
  const bar = barAttributes.children;
  return attr.object(
    {
      x: samples('x'),
      y: samples('y'),
      orientation: attr.enumerated({
        values: ['v', 'h'],
        editType: 'calc',
        description:
          "`'v'`: bin `x` into vertical bars; `'h'`: bin `y` into horizontal bars. Defaults to `'h'` when only `y` is given.",
      }),
      histfunc: attr.enumerated({
        values: ['count', 'sum', 'avg', 'min', 'max'],
        dflt: 'count',
        editType: 'calc',
        description:
          'What each bar shows: the number of samples in the bin (`count`), or the `sum`, average (`avg`), `min` or `max` of the other coordinate (`y` for vertical histograms) over the bin. Needs both coordinates for anything but `count`.',
      }),
      histnorm: attr.enumerated({
        values: ['', 'percent', 'probability', 'density', 'probability density'],
        dflt: '',
        editType: 'calc',
        description:
          "Normalization: `''` the raw values; `percent` / `probability` the share of the total (bar heights sum to 100 / 1); `density` the value per unit of bin width (bar areas sum to the total; per ms on date axes); `probability density` the share per unit width (bar areas sum to 1).",
      }),
      cumulative: attr.object(
        {
          enabled: attr.boolean({
            dflt: false,
            editType: 'calc',
            description:
              'Show the cumulative distribution: each bar sums the bins before it. With a `density` norm it behaves like the norm without density (it rises to the total or to 1).',
          }),
          direction: attr.enumerated({
            values: ['increasing', 'decreasing'],
            dflt: 'increasing',
            editType: 'calc',
            description:
              '`increasing`: sum the bins to the left (rising); `decreasing`: sum the bins to the right.',
          }),
          currentbin: attr.enumerated({
            values: ['include', 'exclude', 'half'],
            dflt: 'include',
            editType: 'calc',
            description:
              'Whether a bar counts its own bin (`include`, a half-bin bias), not at all (`exclude`, the opposite bias) or half of it (`half`, no bias).',
          }),
        },
        { editType: 'calc', description: 'Cumulative histograms.' },
      ),
      nbinsx: attr.integer({
        min: 0,
        dflt: 0,
        editType: 'calc',
        description:
          'Maximum number of bins along x: the bin size is the next round size giving at most this many. 0: automatic. Ignored when `xbins.size` is set.',
      }),
      xbins: binAttributes('x'),
      nbinsy: attr.integer({
        min: 0,
        dflt: 0,
        editType: 'calc',
        description:
          'Maximum number of bins along y (horizontal histograms), see `nbinsx`. Ignored when `ybins.size` is set.',
      }),
      ybins: binAttributes('y'),
      autobinx: attr.boolean({
        editType: 'calc',
        description:
          'Obsolete (every bin attribute is automatic unless set): `true` ignores `xbins` and bins automatically.',
      }),
      autobiny: attr.boolean({
        editType: 'calc',
        description: 'Obsolete: `true` ignores `ybins` and bins automatically.',
      }),
      bingroup: attr.string({
        dflt: '',
        editType: 'calc',
        description:
          'Histograms (and 2D histograms) with the same bin group share their bins, also across subplots on axes of one type. Under `barmode` `stack` or `group`, the histograms of a subplot and orientation always share bins.',
      }),
      offsetgroup: bar['offsetgroup'],
      alignmentgroup: bar['alignmentgroup'],
      text: bar['text'],
      texttemplate: bar['texttemplate'],
      textposition: bar['textposition'],
      insidetextanchor: bar['insidetextanchor'],
      textangle: bar['textangle'],
      textfont: bar['textfont'],
      insidetextfont: bar['insidetextfont'],
      outsidetextfont: bar['outsidetextfont'],
      constraintext: bar['constraintext'],
      zorder: bar['zorder'],
      cliponaxis: bar['cliponaxis'],
      marker: bar['marker'],
      error_x: bar['error_x'],
      error_y: bar['error_y'],
      selected: bar['selected'],
      unselected: bar['unselected'],
    },
    {
      description:
        'Histogram: samples binned into bars (counts, sums, averages…), vertical or horizontal, stacking and grouping with bars.',
    },
  );
})();
