/// <reference types="@mk7s/holochart/global" />
// Script-tag users: `window.Holochart` (the IIFE's global) typed with the shipped global types.
export async function scriptTag(el: HTMLElement): Promise<void> {
  const chart = Holochart.createChart(el, { data: [{ type: 'scatter', y: [1, 3, 2] }] });
  await chart.ready;
  // The 3D add-on's exports are there only once its script has run.
  const traces3d = window.Holochart.traces3d;
  if (traces3d) window.Holochart.register(...traces3d);
}
