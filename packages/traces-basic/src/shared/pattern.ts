/**
 * Pattern fills (plan E8.10): Plotly's `marker.pattern` (bar, histogram, barpolar, pie) and scatter
 * `fillpattern` — the attribute schema, the defaults (plotly.js' `coercePattern`) and the render
 * layer's pattern fills (`PatternFill`, resolved per item by render's lazily loaded pattern code).
 *
 * Colors follow Plotly per item: with `fillmode: 'replace'` (the default) the hatch is drawn in the
 * item's color on a transparent background (pie: the paper color); with `'overlay'` the item's color
 * is the background and the hatch is its contrast color (white on dark colors, `#444` on light
 * ones) at `fgopacity` 0.5. Explicit `fgcolor` / `bgcolor` win.
 */
import { attr, getIn, toRGBA, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { PATTERN_SHAPES, type PatternAttributes, type PatternFill } from '@mk7s/holochart-render';

/** The pattern attributes (`marker.pattern`, `fillpattern`) of fills of `what`. */
export function patternAttributes(what: string, arrayOk = true) {
  return attr.object(
    {
      shape: attr.enumerated({
        values: PATTERN_SHAPES,
        dflt: '',
        arrayOk,
        editType: 'style',
        description: `Hatch shape: diagonal (\`'/'\`, \`'\\\\'\`, \`'x'\`), horizontal and vertical (\`'-'\`, \`'|'\`, \`'+'\`) lines or dots (\`'.'\`); \`''\` for none${arrayOk ? `, or one per ${what}` : ''}.`,
      }),
      fillmode: attr.enumerated({
        values: ['replace', 'overlay'],
        dflt: 'replace',
        editType: 'style',
        description:
          "`'replace'`: the pattern in the fill color on `bgcolor` (default transparent) replaces the fill; `'overlay'`: the pattern is drawn over the fill color, in its contrast color at half opacity by default.",
      }),
      bgcolor: attr.color({
        arrayOk,
        editType: 'style',
        description: `Pattern background. Default: the fill color with \`fillmode: 'overlay'\`, else transparent${arrayOk ? `, or one per ${what}` : ''}.`,
      }),
      fgcolor: attr.color({
        arrayOk,
        editType: 'style',
        description: `Pattern color. Default: the fill color with \`fillmode: 'replace'\`, else white or dark grey, whichever contrasts with \`bgcolor\`${arrayOk ? `, or one per ${what}` : ''}.`,
      }),
      fgopacity: attr.number({
        min: 0,
        max: 1,
        editType: 'style',
        description:
          "Opacity of the pattern color. Default 0.5 with `fillmode: 'overlay'`, else 1.",
      }),
      size: attr.number({
        min: 0,
        dflt: 8,
        arrayOk,
        editType: 'style',
        description: `Size of the pattern's tiles in CSS px: the spacing of its lines or dots${arrayOk ? `, or one per ${what}` : ''}.`,
      }),
      solidity: attr.number({
        min: 0,
        max: 1,
        dflt: 0.3,
        arrayOk,
        editType: 'style',
        description: `Fraction of the area the pattern covers: 0 shows only the background, 1 only the pattern color${arrayOk ? `, or one per ${what}` : ''}.`,
      }),
    },
    {
      editType: 'style',
      description: `Hatch pattern of the ${what} fill (drawn in screen px, for print and grayscale).`,
    },
  );
}

/**
 * Plotly's `coercePattern`, for the pattern at `path` when the trace (`traceIn`) or its template
 * has one: the rest of it only with a `shape`. The colors and `fgopacity` that Plotly derives from
 * the fill color and `fillmode` are left unset: they are resolved per item when drawing (render's
 * `PatternFill`).
 */
export function supplyPatternDefaults(
  traceIn: unknown,
  ctx: TraceDefaultsContext,
  path: string,
): void {
  if (!getIn(traceIn, path) && !getIn(ctx.template, path)) return;
  if (ctx.coerce(`${path}.shape`)) ctx.coerceContainer(path);
}

/**
 * The render layer's pattern fill for items of `color` (4 floats per item, before `opacity`) over
 * `background` (a CSS color), or `null` without a `pattern.shape` (then primitives keep their
 * plain shaders).
 */
export function patternFill(
  pattern: unknown,
  color: ArrayLike<number>,
  opacity: ArrayLike<number> | number = 1,
  background?: unknown,
): PatternFill | null {
  return (pattern as PatternAttributes | undefined)?.['shape']
    ? { pattern: pattern as PatternAttributes, color, opacity, background, parse: toRGBA }
    : null;
}
