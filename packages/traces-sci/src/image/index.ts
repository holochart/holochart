/**
 * The `image` trace module (plan E11.3): pixel colors — RGB, RGBA or HSL components per pixel
 * (`z` with `colormodel`, rescaled by `zmin` / `zmax`), or an encoded picture (`source`, a data
 * URI) — drawn as one texture on the axes, pixelated or smoothed (`zsmooth: 'fast'`), with pixel
 * hover. Its axes default to a reversed y and square pixels (`scaleanchor`, set by core's axis
 * defaults as in Plotly). Registered with `register(image)` (ADR-019).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { imageAttributes } from './attributes.ts';
import { calcImage, imageExtremes, type ImageCalc } from './calc.ts';
import { supplyImageDefaults } from './defaults.ts';
import { describeImage } from './describe.ts';
import { imageHoverPoints } from './hover.ts';
import { imageRenderer } from './plot.ts';

export const image: TraceModule<ImageCalc, typeof imageAttributes.children> = {
  type: 'image',
  categories: ['cartesian', '2dMap', 'noSortingByValue'],
  schema: imageAttributes,
  meta: {
    description:
      'Images: pixel colors (RGB, RGBA or HSL components, or an encoded picture) drawn as one texture on the axes, with pixel hover.',
    docsPage: 'image',
    plotlyEquivalent: 'image',
  },
  supplyDefaults: supplyImageDefaults,
  calc: (trace, ctx) => calcImage(trace, ctx),
  extremes: imageExtremes,
  plot: imageRenderer,
  hoverPoints: imageHoverPoints,
  describe: describeImage,
};

export { imageAttributes } from './attributes.ts';
export type { ImageCalc } from './calc.ts';
export type { Colormodel } from './colormodel.ts';
