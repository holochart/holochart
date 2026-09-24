import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1) with `layout.template: 'plotly'`. */
const sampler = themeSampler('plotly');

export const meta = sampler.meta;
export const run = sampler.run;
