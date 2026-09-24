/**
 * `error_x` / `error_y` attribute schema (plan E9.7), shared by every trace type that supports
 * error bars (scatter now, bar later). Mirrors plotly.js `src/components/errorbars/attributes.js`.
 *
 * Fields that change the bar extents (`type`, `array`, `value`, …) are `calc` edits because error
 * bars pad the autorange; purely visual fields are `style` edits.
 */
import { attr } from '@mk7s/holochart-core';

/** The error-bar computation types, as in Plotly. */
export const ERROR_BAR_TYPES = ['percent', 'constant', 'sqrt', 'data'] as const;

/** One of {@link ERROR_BAR_TYPES}. */
export type ErrorBarType = (typeof ERROR_BAR_TYPES)[number];

function common(letter: 'x' | 'y') {
  const axis = `${letter} axis`;
  return {
    visible: attr.boolean({
      editType: 'calc',
      description:
        'Whether this set of error bars is visible. Defaults to true when `array` or `value` is given, or `type` is `sqrt`.',
    }),
    type: attr.enumerated({
      values: ERROR_BAR_TYPES,
      editType: 'calc',
      description:
        "How the bar lengths are computed: `'percent'` of the underlying value, a `'constant'`, the `'sqrt'` of the value, or per-point `'data'` (`array` / `arrayminus`). Defaults to `'data'` when `array` is given, else `'percent'`.",
    }),
    symmetric: attr.boolean({
      editType: 'calc',
      description:
        'Whether both directions use the same length. Defaults to true unless `arrayminus` (`data`) or `valueminus` (`percent`, `constant`) is given.',
    }),
    array: attr.dataArray({
      editType: 'calc',
      description: `Bar lengths in the positive ${axis} direction (or both directions when \`symmetric\`), one per point, for \`type\` \`'data'\`.`,
    }),
    arrayminus: attr.dataArray({
      editType: 'calc',
      description: `Bar lengths in the negative ${axis} direction, one per point, for \`type\` \`'data'\` with \`symmetric: false\`.`,
    }),
    value: attr.number({
      min: 0,
      dflt: 10,
      editType: 'calc',
      description: `Bar length in the positive ${axis} direction (or both when \`symmetric\`): a percentage of the value for \`'percent'\`, an absolute length for \`'constant'\`.`,
    }),
    valueminus: attr.number({
      min: 0,
      dflt: 10,
      editType: 'calc',
      description: `Bar length in the negative ${axis} direction when \`symmetric\` is false (see \`value\`).`,
    }),
    traceref: attr.integer({
      min: 0,
      dflt: 0,
      editType: 'calc',
      description: 'Accepted for Plotly compatibility; has no effect.',
    }),
    tracerefminus: attr.integer({
      min: 0,
      dflt: 0,
      editType: 'calc',
      description: 'Accepted for Plotly compatibility; has no effect.',
    }),
    thickness: attr.number({
      min: 0,
      dflt: 2,
      editType: 'style',
      description: 'Stroke width of the bars and their end caps, in CSS px.',
    }),
    width: attr.number({
      min: 0,
      editType: 'style',
      description:
        'Half-length of the cross-bar at each end, in CSS px (default 4). 0 hides the caps.',
    }),
    color: attr.color({
      editType: 'style',
      description: 'Color of the bars. Defaults to the trace color.',
    }),
  };
}

function errorXAttributes() {
  return attr.object(
    {
      ...common('x'),
      copy_ystyle: attr.boolean({
        editType: 'style',
        description:
          'Use the `error_y` color, thickness and width. Defaults to true when `error_y` is visible and none of those is set here.',
      }),
    },
    { editType: 'calc', description: 'Error bars along the x axis.' },
  );
}

function errorYAttributes() {
  return attr.object(common('y'), {
    editType: 'calc',
    description: 'Error bars along the y axis.',
  });
}

/**
 * Schema of the `error_<letter>` container. `error_x` also gets `copy_ystyle`, which makes it take
 * its color, thickness and width from `error_y`. A fresh node is returned per call so each trace
 * schema owns its own copy.
 */
export function errorBarAttributes(letter: 'x'): ReturnType<typeof errorXAttributes>;
export function errorBarAttributes(letter: 'y'): ReturnType<typeof errorYAttributes>;
export function errorBarAttributes(
  letter: 'x' | 'y',
): ReturnType<typeof errorXAttributes> | ReturnType<typeof errorYAttributes>;
export function errorBarAttributes(letter: 'x' | 'y') {
  return letter === 'x' ? errorXAttributes() : errorYAttributes();
}
