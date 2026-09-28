import { themeSampler } from '../_lib/theme-sampler.ts';

/** The theme sampler (plan E8.1, E17.5) with `layout.template: 'high-contrast-dark'`. */
const sampler = themeSampler('high-contrast-dark');

export const meta = sampler.meta;
export const run = sampler.run;
