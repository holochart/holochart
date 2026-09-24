import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1) with `layout.template: 'holochart'`. */
const sampler = themeSampler('holochart');

export const meta = sampler.meta;
export const run = sampler.run;
