/** Validation issue types (plan E1.3). */

/** What kind of problem an issue describes. */
export type IssueCode =
  | 'unknown-attribute'
  | 'invalid-value'
  | 'out-of-range'
  | 'invalid-container'
  | 'unknown-trace-type'
  | 'unknown-template'
  | 'deprecated';

/**
 * One problem found in a figure.
 *
 * - `error` — the value was rejected and a default is used instead.
 * - `warning` — the value was used, possibly adjusted (clamped), or the attribute is unknown or
 *   deprecated.
 */
export interface Issue {
  /** Full path, e.g. `data[0].marker.size`, `layout.xaxis2.range`, `config.scrollZoom`. */
  path: string;
  message: string;
  /** The offending value. */
  value: unknown;
  /** What would have been accepted. */
  expected?: string;
  code: IssueCode;
  severity: 'error' | 'warning';
  /** "Did you mean" suggestion for unknown attributes, trace types and templates. */
  suggestion?: string;
}

/** Thrown by supply-defaults in `config.strict` mode, carrying the first issue. */
export class ValidationError extends Error {
  readonly issue: Issue;
  constructor(issue: Issue) {
    super(`${issue.path}: ${issue.message}`);
    this.name = 'ValidationError';
    this.issue = issue;
  }
}

/** Format an issue for console output. */
export function formatIssue(issue: Issue): string {
  return `[holochart] ${issue.path}: ${issue.message}`;
}
