import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1) with `layout.template: 'plotly_dark'`. */
const sampler = themeSampler('plotly_dark');

export const meta = sampler.meta;
export const run = sampler.run;
