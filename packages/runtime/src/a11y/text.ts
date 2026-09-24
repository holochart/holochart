/**
 * Plain-text helpers for accessible descriptions (plan E17.1), shared by the runtime and by trace
 * modules' `describe()`: screen readers get plain text, formatted the way the chart shows it.
 */
import { formatValue } from '@mk7s/holochart-core';
import type { AxisInfo } from '../contracts.ts';

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Plotly rich text (`<b>`, `<br>`, `<a href>`, entities) as plain text for assistive technology:
 * line breaks become spaces, tags are dropped, entities decoded, whitespace collapsed.
 *
 * @example
 * ```ts
 * accessibleText('Revenue<br><i>(USD)</i> &amp; costs'); // 'Revenue (USD) & costs'
 * ```
 */
export function accessibleText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A linear coordinate of `axis` as its hover label shows it (`hoverformat`, dates, categories,
 * prefix / suffix), or a plain number without an axis. Non-finite values give `''`.
 */
export function formatAxisValue(axis: AxisInfo | undefined, l: number): string {
  if (!Number.isFinite(l)) return '';
  if (!axis) return formatPlainNumber(l);
  try {
    return formatValue(axis.scale, axis.full, l, true);
  } catch {
    return formatPlainNumber(l);
  }
}

/** A number with up to 6 significant digits, without trailing zeros (`1234.5`, `0.000123`). */
export function formatPlainNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  return String(Number(v.toPrecision(6)));
}

/** `a`, `a and b`, `a, b and c`. */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** `1 point`, `3 points`. */
export function countText(n: number, noun: string, plural = `${noun}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? noun : plural}`;
}

/** The trace's name as plain text, or Plotly's default `trace <index>`. */
export function traceNameText(name: unknown, index: number): string {
  const text = accessibleText(name);
  return text === '' ? `trace ${index}` : text;
}
