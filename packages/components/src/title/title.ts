/**
 * Figure title and subtitle (plan E5.1): `title.{text, font, x, y, xref, yref, xanchor, yanchor,
 * pad, automargin}` and `title.subtitle.{text, font}`, drawn as SDF text in the overlay.
 *
 * Core's base layout declares the original `title` attributes; this component re-declares the
 * container with `subtitle`, `pad` and `automargin` added (a component's layout attributes replace
 * the base container of the same name).
 */
import { attr, fontSchema, layoutSchema, type FullLayout } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type {
  ComponentDrawContext,
  ComponentModule,
  ComponentUpdatePlan,
  ComponentView,
  MarginPush,
} from '@mk7s/holochart-runtime';
import type { LabelItem } from '../axes/geometry.ts';
import { TextBatch } from '../shared/batches.ts';
import { overlayTransform } from '../shared/host.ts';
import {
  inheritFont,
  measureBlock,
  oracleMeasure,
  rgba,
  styledText,
  textFont,
  type FullFont,
  type MeasureLine,
} from '../shared/text.ts';

const TITLE_EDIT = ['layout', 'plot'] as const;

/** The `title` container with subtitle, padding and automargin (plan E5.1). */
export const titleAttributes = attr.object(
  {
    ...layoutSchema.children.title.children,
    subtitle: attr.object(
      {
        text: attr.string({ dflt: '', description: 'Subtitle text, drawn below the title.' }),
        font: fontSchema('Subtitle font. Defaults to `layout.font`.'),
      },
      { editType: TITLE_EDIT, description: 'Subtitle.' },
    ),
    pad: attr.object(
      {
        t: attr.number({ dflt: 0, description: 'Padding above the title, px (`yanchor: top`).' }),
        r: attr.number({
          dflt: 0,
          description: 'Padding right of the title, px (`xanchor: right`).',
        }),
        b: attr.number({
          dflt: 0,
          description: 'Padding below the title, px (`yanchor: bottom`).',
        }),
        l: attr.number({
          dflt: 0,
          description: 'Padding left of the title, px (`xanchor: left`).',
        }),
      },
      {
        editType: TITLE_EDIT,
        description: 'Padding between the title and its anchor, applied on the anchored side only.',
      },
    ),
    automargin: attr.boolean({
      dflt: false,
      description:
        'Grow the top margin so the title (and subtitle) fit. With `yref: paper` the title then sits right above the plot area.',
    }),
  },
  { editType: TITLE_EDIT, description: 'Figure title.' },
);

interface FullTitle {
  text: string;
  font: FullFont;
  x: number;
  y: number | 'auto';
  xref: 'container' | 'paper';
  yref: 'container' | 'paper';
  xanchor: 'auto' | 'left' | 'center' | 'right';
  yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  subtitle: { text: string; font: Partial<FullFont> };
  pad: { t: number; r: number; b: number; l: number };
  automargin: boolean;
}

/** Gap between title and subtitle, px. */
const SUBTITLE_GAP = 2;

/** Resolved title layout: labels in container px and the top-margin push. */
export interface TitleLayout {
  labels: LabelItem[];
  push: MarginPush | undefined;
}

function titleOf(fullLayout: FullLayout): FullTitle | undefined {
  const t = fullLayout['title'] as FullTitle | undefined;
  return t && typeof t === 'object' ? t : undefined;
}

/** Height of the title + subtitle block and its pieces. */
function blocks(t: FullTitle, fullLayout: FullLayout, measure: MeasureLine) {
  const { text, font } = styledText(t.text, textFont(t.font));
  const subFull = inheritFont(t.subtitle?.font, fullLayout.font as FullFont);
  const { text: subText, font: subFont } = styledText(t.subtitle?.text ?? '', textFont(subFull));
  const main = measureBlock(text, font, measure);
  const sub = measureBlock(subText, subFont, measure);
  const gap = main.height > 0 && sub.height > 0 ? SUBTITLE_GAP : 0;
  return {
    text,
    subText,
    font,
    subFont,
    subFull,
    main,
    sub,
    height: main.height + gap + sub.height,
    gap,
  };
}

/**
 * Title placement (Plotly semantics): `x`/`y` in container or paper fractions; `auto` anchors pick
 * left/center/right (top/middle/bottom) by thirds; `y: 'auto'` centers the block in the top
 * margin (or, with `automargin` and `yref: paper`, sets it right above the plot area). `pad`
 * applies on the anchored side.
 */
export function titleLayout(
  fullLayout: FullLayout,
  size: { width: number; height: number },
  plotArea: Readonly<ViewportRect>,
  margin: { t: number },
  measure: MeasureLine,
): TitleLayout {
  const t = titleOf(fullLayout);
  if (!t) return { labels: [], push: undefined };
  const b = blocks(t, fullLayout, measure);
  if (b.height <= 0) return { labels: [], push: undefined };

  const xanchor =
    t.xanchor !== 'auto' ? t.xanchor : t.x < 1 / 3 ? 'left' : t.x > 2 / 3 ? 'right' : 'center';
  let x = t.xref === 'paper' ? plotArea.x + t.x * plotArea.width : t.x * size.width;
  if (xanchor === 'left') x += t.pad.l;
  else if (xanchor === 'right') x -= t.pad.r;

  // Top of the block, container px.
  let top: number;
  if (t.y === 'auto') {
    if (t.automargin && t.yref === 'paper') top = plotArea.y - t.pad.b - b.height;
    else top = margin.t / 2 - b.height / 2;
  } else {
    const y =
      t.yref === 'paper' ? plotArea.y + (1 - t.y) * plotArea.height : (1 - t.y) * size.height;
    const yanchor =
      t.yanchor !== 'auto' ? t.yanchor : t.y > 2 / 3 ? 'top' : t.y < 1 / 3 ? 'bottom' : 'middle';
    top =
      yanchor === 'top'
        ? y + t.pad.t
        : yanchor === 'bottom'
          ? y - t.pad.b - b.height
          : y - b.height / 2;
  }

  const labels: LabelItem[] = [];
  if (b.text !== '') {
    labels.push({
      text: b.text,
      x,
      y: top,
      anchorX: xanchor,
      anchorY: 'top',
      angle: 0,
      font: b.font,
      color: rgba(t.font.color),
    });
  }
  if (b.subText !== '') {
    labels.push({
      text: b.subText,
      x,
      y: top + b.main.height + b.gap,
      anchorX: xanchor,
      anchorY: 'top',
      angle: 0,
      font: b.subFont,
      color: rgba(b.subFull.color),
    });
  }

  let push: MarginPush | undefined;
  if (t.automargin) {
    const need = Math.ceil(b.height + t.pad.t + t.pad.b);
    push = { t: need };
  }
  return { labels, push };
}

class TitleView implements ComponentView {
  readonly #text: TextBatch;

  constructor(ctx: ComponentDrawContext) {
    this.#text = new TextBatch(ctx, ctx.primitives, ctx.overlay);
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    if (!plan.layout && !plan.stages.has('plot') && !plan.stages.has('style')) return;
    this.#draw(ctx);
  }

  #draw(ctx: ComponentDrawContext): void {
    const lay = titleLayout(ctx.fullLayout, ctx, ctx.plotArea, ctx.margin, oracleMeasure);
    this.#text.setTransform(overlayTransform(ctx.height));
    this.#text.set(lay.labels);
  }
}

/** The figure title component (`layout.title`, E5.1). */
export const titleComponent: ComponentModule = {
  name: 'title',
  order: 10,
  // Subtitle font fields left unset inherit `layout.font` when drawn (nothing extra to default).
  layoutSchema: { title: titleAttributes },
  pushMargin(ctx) {
    const t = titleOf(ctx.fullLayout);
    if (!t?.automargin) return undefined;
    // The push only depends on text sizes, so no plot area is needed.
    return titleLayout(
      ctx.fullLayout,
      ctx,
      { x: 0, y: 0, width: ctx.width, height: ctx.height },
      { t: 0 },
      oracleMeasure,
    ).push;
  },
  draw: {
    create: (ctx) => new TitleView(ctx),
  },
};
