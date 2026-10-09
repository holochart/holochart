/** Compare actual generated routes and guide anchors with the retained Wave 2 artifact. */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const snapshot = JSON.parse(await readFile(new URL('./wave2-routes.json', import.meta.url)));
const root = path.resolve('apps/docs/.vitepress/dist');
const missingRoutes = [];
const missingAnchors = [];
for (const route of snapshot.routes) {
  try {
    await access(path.join(root, route));
  } catch {
    missingRoutes.push(route);
  }
}
for (const [route, anchors] of Object.entries(snapshot.chartExampleAnchors)) {
  if (missingRoutes.includes(route)) continue;
  const html = await readFile(path.join(root, route), 'utf8');
  const actual = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const anchor of anchors) if (!actual.has(anchor)) missingAnchors.push(`${route}#${anchor}`);
}
const result = {
  checkedAt: new Date().toISOString(),
  base: snapshot.base,
  previousRoutes: snapshot.routes.length,
  previousChartAnchors: Object.values(snapshot.chartExampleAnchors).flat().length,
  missingRoutes,
  missingAnchors,
};
await writeFile(
  process.env.SITE_ROUTE_REPORT ?? new URL('./route-continuity.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result));
if (missingRoutes.length || missingAnchors.length) process.exitCode = 1;
