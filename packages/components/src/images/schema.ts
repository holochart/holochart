/**
 * `layout.images[]` attributes and defaults (plan E5.6), following Plotly's layout images: a
 * picture (URL or data URI) placed in paper, domain or data coordinates, e.g. a logo or a
 * background.
 */
import { attr, type FullLayout } from '@mk7s/holochart-core';

const REF =
  "`'paper'` (0–1 across the plot area), an axis id (`'x'`, `'x2'`: that axis' range units, so exponents on log axes) or `'<axis> domain'` (0–1 across that axis' domain).";

/** One image. */
export const imageItemAttributes = {
  visible: attr.boolean({ dflt: true, description: 'Draw this image.' }),
  source: attr.string({
    description:
      'Image URL or data URI (PNG, JPEG, SVG, …). Cross-origin URLs need CORS headers (WebGL cannot draw tainted images).',
  }),
  layer: attr.enumerated({
    values: ['below', 'above'],
    dflt: 'above',
    description:
      '`above` traces, or `below` them and the grid (images with a `paper` reference go under every subplot).',
  }),
  sizex: attr.number({ dflt: 0, description: 'Width of the image box, in `xref` units.' }),
  sizey: attr.number({ dflt: 0, description: 'Height of the image box, in `yref` units.' }),
  sizing: attr.enumerated({
    values: ['fill', 'contain', 'stretch'],
    dflt: 'contain',
    description:
      '`contain`: fit inside the box keeping the aspect ratio; `fill`: cover the box keeping the aspect ratio (cropped); `stretch`: fill the box exactly.',
  }),
  opacity: attr.number({ min: 0, max: 1, dflt: 1, description: 'Opacity of the image.' }),
  x: attr.any({ dflt: 0, description: 'x position of the box, in `xref` units.' }),
  y: attr.any({ dflt: 0, description: 'y position of the box, in `yref` units.' }),
  xanchor: attr.enumerated({
    values: ['left', 'center', 'right'],
    dflt: 'left',
    description: 'Which side of the box sits at `x` (and where a `contain`ed image aligns).',
  }),
  yanchor: attr.enumerated({
    values: ['top', 'middle', 'bottom'],
    dflt: 'top',
    description: 'Which side of the box sits at `y` (and where a `contain`ed image aligns).',
  }),
  xref: attr.string({ dflt: 'paper', description: `Reference of \`x\` and \`sizex\`: ${REF}` }),
  yref: attr.string({ dflt: 'paper', description: `Reference of \`y\` and \`sizey\`: ${REF}` }),
} as const;

/** `layout.images`. */
export const imagesAttributes = attr.items(imageItemAttributes, {
  itemName: 'image',
  editType: ['plot'],
  description: 'Pictures placed on the figure: logos, backgrounds (plan E5.6).',
});

/** A defaulted layout image. */
export interface FullLayoutImage {
  _index: number;
  visible: boolean;
  source?: string;
  layer: 'below' | 'above';
  sizex: number;
  sizey: number;
  sizing: 'fill' | 'contain' | 'stretch';
  opacity: number;
  x: unknown;
  y: unknown;
  xanchor: 'left' | 'center' | 'right';
  yanchor: 'top' | 'middle' | 'bottom';
  xref: string;
  yref: string;
}

/** Images without a `source` are hidden (Plotly). Idempotent. */
export function supplyImageDefaults(layoutOut: FullLayout): void {
  const list = layoutOut['images'];
  if (!Array.isArray(list)) return;
  for (const im of list as Partial<FullLayoutImage>[]) {
    if (typeof im.source !== 'string' || im.source === '') im.visible = false;
  }
}
