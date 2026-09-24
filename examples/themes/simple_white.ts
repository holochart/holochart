import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1) with `layout.template: 'simple_white'`. */
const sampler = themeSampler('simple_white');

export const meta = sampler.meta;
export const run = sampler.run;
