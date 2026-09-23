/**
 * `error_x` / `error_y` supply-defaults (plan E9.7), a port of plotly.js
 * `src/components/errorbars/defaults.js`. Attributes that do not apply to the chosen `type` or
 * `symmetric` mode are not coerced, so they don't show in `fullData` (Plotly semantics).
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';

/** Options for {@link supplyErrorBarDefaults}. */
export interface ErrorBarDefaultsOptions {
  /** Default bar color, normally the trace color. */
  defaultColor: string;
  /**
   * Letter of the error-bar container this one can copy its style from (`'y'` for `error_x`,
   * enabling `copy_ystyle`). Must be defaulted before this one.
   */
  inherit?: 'y';
}

/** Default cap half-width in CSS px (Plotly uses 0 for 3D traces, which don't exist yet). */
const DEFAULT_WIDTH = 4;

/** Plotly's `fast-isnumeric`: finite numbers and non-blank numeric strings. */
function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Supply defaults for `error_<letter>`. Visibility is inferred from the input (bars appear as
 * soon as `array` or `value` is given, or `type` is `'sqrt'`), then `type` and `symmetric` are
 * inferred from which fields the user set. Trace modules call this for `'y'` first, then for
 * `'x'` with `inherit: 'y'`.
 */
export function supplyErrorBarDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  letter: 'x' | 'y',
  opts: ErrorBarDefaultsOptions,
): void {
  const name = `error_${letter}`;
  const rawIn = traceIn[name];
  const containerIn: Readonly<Record<string, unknown>> = isRecord(rawIn) ? rawIn : {};
  const coerce = <T = unknown>(attribute: string, dflt?: unknown): T =>
    ctx.coerce<T>(`${name}.${attribute}`, dflt);

  const hasErrorBars =
    containerIn['array'] !== undefined ||
    containerIn['value'] !== undefined ||
    containerIn['type'] === 'sqrt';
  const visible = coerce<boolean>('visible', hasErrorBars);
  if (visible === false) return;

  const type = coerce<string>('type', 'array' in containerIn ? 'data' : 'percent');
  let symmetric = true;
  if (type !== 'sqrt') {
    // Giving the minus-side field is how users opt into asymmetric bars without saying so.
    const minusKey = type === 'data' ? 'arrayminus' : 'valueminus';
    symmetric = coerce<boolean>('symmetric', !(minusKey in containerIn));
  }

  if (type === 'data') {
    coerce('array');
    coerce('traceref');
    if (!symmetric) {
      coerce('arrayminus');
      coerce('tracerefminus');
    }
  } else if (type === 'percent' || type === 'constant') {
    coerce('value');
    if (!symmetric) coerce('valueminus');
  }

  const inherit = opts.inherit;
  let copy = false;
  if (inherit !== undefined) {
    const inheritFrom = traceOut[`error_${inherit}`];
    if (isRecord(inheritFrom) && inheritFrom['visible']) {
      // Copy only when the user styled nothing here; any explicit style opts out.
      copy = coerce<boolean>(
        `copy_${inherit}style`,
        !(
          containerIn['color'] ||
          isNumeric(containerIn['thickness']) ||
          isNumeric(containerIn['width'])
        ),
      );
    }
  }
  if (!copy) {
    coerce('color', opts.defaultColor);
    coerce('thickness');
    coerce('width', DEFAULT_WIDTH);
  }
}
