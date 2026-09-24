import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1) with `layout.template: 'seaborn'`. */
const sampler = themeSampler('seaborn');

export const meta = sampler.meta;
export const run = sampler.run;
