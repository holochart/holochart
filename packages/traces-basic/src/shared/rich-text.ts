/**
 * Rich text for trace labels (plan E2.10): Plotly pseudo-HTML (`<b>`, `<sup>`, `<span style>`,
 * `<a href>`…) in scatter, bar and pie text, drawn by the text primitive as styled runs.
 *
 * The trace-side twin of the components' `styledText` / `handleLinkPointer` (traces-basic does not
 * depend on the components package). Plain strings never reach the parser, and labels whose runs
 * all share one style (a whole label in `<b>…</b>`, or markup that is only `<br>` and entities)
 * stay ONE plain label with that font, so they typeset and batch exactly like plain text; only
 * genuinely mixed labels carry `runs`, one batch member per run.
 */
import { richTextLabel } from '@mk7s/holochart-core';
import {
  layoutTextRuns,
  measureText,
  TEXT_DEFAULT_FONT,
  textLinkAt,
  type DataTransform,
  type TextFont,
  type TextLabel,
  type TextLink,
  type TextRunLines,
} from '@mk7s/holochart-render';
import type { SubplotInfo } from '@mk7s/holochart-runtime';

/** A label's content for the text primitive once its markup is resolved. */
export interface RichLabel {
  /** Plain equivalent (tags removed, entities decoded, one `\n` per line break). */
  readonly text: string;
  /** The label font: the base font, or the base font with the label-wide style merged in. */
  readonly font: TextFont;
  /** Styled runs (absolute sizes in px) when runs differ in style; unset for a plain label. */
  readonly runs?: TextRunLines;
  readonly lineCount: number;
}

/**
 * Resolve Plotly pseudo-HTML against a base font; `undefined` for text without markup or
 * entities, which callers keep drawing through their plain-text path unchanged.
 *
 * @param newlines - Raw newlines: `'break'` (a line break, what the text primitive does with
 *   `\n`) or `'space'` (Plotly's SVG text, e.g. scatter labels).
 */
export function richLabel(
  text: string,
  font: TextFont,
  newlines: 'break' | 'space' = 'break',
): RichLabel | undefined {
  return richTextLabel(text, font, { newlines });
}

/**
 * A label for `text` in `font`: its rich form, or the plain text with the font unchanged. Raw
 * newlines break lines.
 */
export function labelContent(text: string, font: TextFont): RichLabel {
  return richLabel(text, font) ?? { text, font, lineCount: 1 };
}

/**
 * Unrotated block size of a label in px at `lineHeight`: plain labels through `measureText` (as
 * before rich text), rich ones laid out run by run like the primitive draws them.
 */
export function measureLabel(
  label: Pick<RichLabel, 'text' | 'font' | 'runs'>,
  lineHeight: number,
): { width: number; height: number } {
  if (!label.runs) {
    const m = measureText(label.text, label.font, lineHeight);
    return { width: m.width, height: m.height };
  }
  const layout = layoutTextRuns(label.runs, { font: label.font, lineHeight });
  return { width: layout.width, height: layout.height };
}

/** Whether a label has a clickable run. */
export function hasLink(label: Pick<TextLabel, 'runs'>): boolean {
  return label.runs?.some((line) => line.some((r) => r.link !== undefined)) === true;
}

/**
 * The link of `label` under a pointer, given the label anchor in container px: `(px, py)` is the
 * pointer, `(ax, ay)` the anchor (both top-left origin, +y down).
 */
export function labelLinkAt(
  label: TextLabel,
  ax: number,
  ay: number,
  px: number,
  py: number,
): TextLink | null {
  if (!label.runs) return null;
  const font: TextFont = { ...TEXT_DEFAULT_FONT, ...label.font };
  return textLinkAt(
    label.runs,
    {
      font,
      ...(label.lineHeight !== undefined ? { lineHeight: label.lineHeight } : {}),
      ...(label.anchorX !== undefined ? { anchorX: label.anchorX } : {}),
      ...(label.anchorY !== undefined ? { anchorY: label.anchorY } : {}),
      ...(label.align !== undefined ? { align: label.align } : {}),
      ...(label.angle !== undefined ? { angle: label.angle } : {}),
      ...(label.offset !== undefined ? { offset: label.offset } : {}),
    },
    px - ax,
    py - ay,
  );
}

/**
 * The link under a pointer among labels positioned in linear coordinates of a cartesian subplot
 * (scatter, bar). `transform` maps them to viewport px (y up, viewport-local); the subplot rect
 * places the viewport in the container. Points outside the plot area hit nothing (labels are
 * clipped there). Later labels win (drawn on top).
 */
export function cartesianLinkAt(
  labels: readonly TextLabel[],
  transform: Readonly<DataTransform>,
  subplot: SubplotInfo | undefined,
  px: number,
  py: number,
): TextLink | null {
  if (labels.length === 0 || !subplot) return null;
  const rect = subplot.rect;
  if (px < rect.x || px > rect.x + rect.width || py < rect.y || py > rect.y + rect.height) {
    return null;
  }
  for (let k = labels.length - 1; k >= 0; k--) {
    const label = labels[k] as TextLabel;
    const ax = rect.x + label.x * transform.scaleX + transform.offsetX;
    const ay = rect.y + rect.height - (label.y * transform.scaleY + transform.offsetY);
    const link = labelLinkAt(label, ax, ay, px, py);
    if (link) return link;
  }
  return null;
}

export {
  fadeTextRuns as fadeRuns,
  handleTextLinkPointer as handleLinkPointer,
  openTextLink,
  scaleTextRuns as scaleRuns,
} from '@mk7s/holochart-render';
