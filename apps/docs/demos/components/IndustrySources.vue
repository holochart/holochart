<script setup lang="ts">
/**
 * Sources of the industry chart: every cited page per series, from the data file itself (imported
 * directly, so the page doesn't bundle the demo's other datasets).
 */
import industry from '@mk7s/holochart-examples/demos/openrouter/data/industry.json';

const rows = industry.series.map((s) => ({
  name: s.name,
  unit: s.unit,
  count: s.points.length,
  sources: links([...new Set(s.points.map((p) => p.source))]),
}));

/** Link labels: the host, plus the last path segment when a series cites one host twice. */
function links(urls: string[]): { url: string; label: string }[] {
  const host = (url: string): string => new URL(url).hostname.replace(/^www\./, '');
  return urls.map((url) => {
    const h = host(url);
    const repeated = urls.filter((u) => host(u) === h).length > 1;
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const slug = last.length > 28 ? `${last.slice(0, 26)}…` : last;
    return { url, label: repeated && slug ? `${h}/…/${slug}` : h };
  });
}
</script>

<template>
  <ul class="hc-sources">
    <li v-for="row in rows" :key="row.name">
      <strong>{{ row.name }}</strong>
      <span class="hc-sources-unit"> · {{ row.unit }}, {{ row.count }} figures: </span>
      <template v-for="(s, i) in row.sources" :key="s.url">
        <a :href="s.url" target="_blank" rel="noopener">{{ s.label }}</a
        ><span v-if="i < row.sources.length - 1">, </span>
      </template>
    </li>
  </ul>
</template>
