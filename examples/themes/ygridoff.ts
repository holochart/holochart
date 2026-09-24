import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1) with `layout.template: 'ygridoff'`. */
const sampler = themeSampler('ygridoff');

export const meta = sampler.meta;
export const run = sampler.run;
