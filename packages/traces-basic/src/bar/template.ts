/**
 * Minimal `texttemplate` formatting for bar labels (plan E9.8): `%{name}`, `%{name:d3format}` and
 * `%{name|dateformat}`, with dotted and indexed names (`%{marker.color}`, `%{customdata[0]}`).
 *
 * Without a format, a variable uses its preformatted label when the caller provides one (axis
 * hover formatting, Plotly's `xLabel` convention), else its string form. Unknown variables render
 * as ''. The hover workstream's `hovertemplate` (E5.7) is the full implementation; this helper can
 * move to a shared module once that lands.
 */
import { dateToMs, formatDateLabel, formatNumber, getIn } from '@mk7s/holochart-core';

const VARIABLE = /%\{([^}:|]+)(?:([:|])([^}]*))?\}/g;

/** Values and default labels for one bar. */
export interface TemplateScope {
  /** Raw values, looked up by (dotted) name. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Preformatted labels by variable name, used when no format is given. */
  readonly labels?: Readonly<Record<string, string>>;
}

function formatOne(value: unknown, kind: string | undefined, format: string | undefined): string {
  if (value === undefined || value === null) return '';
  if (kind === ':' && format) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? formatNumber(n, { tickformat: format }) : String(value);
  }
  if (kind === '|' && format) {
    const ms = typeof value === 'number' ? value : dateToMs(value);
    return Number.isFinite(ms) ? formatDateLabel(ms, format, null) : String(value);
  }
  return String(value);
}

/**
 * Fill a template for one bar.
 *
 * @example
 * ```ts
 * formatTemplate('%{label}: %{value:.1f}', { values: { label: 'A', value: 3.14159 } }); // 'A: 3.1'
 * ```
 */
export function formatTemplate(template: string, scope: TemplateScope): string {
  if (!template.includes('%{')) return template;
  return template.replace(VARIABLE, (_match, rawName: string, kind?: string, format?: string) => {
    const name = rawName.trim();
    if (!kind) {
      const label = scope.labels?.[name];
      if (label !== undefined) return label;
    }
    let value: unknown;
    try {
      value = getIn(scope.values, name);
    } catch {
      // A malformed path (`%{a[}`) renders as '' like an unknown variable.
      value = undefined;
    }
    return formatOne(value, kind, format);
  });
}
