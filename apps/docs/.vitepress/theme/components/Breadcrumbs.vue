<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { chartFamilies } from '../../../../../examples/_lib/families.ts';

const { page } = useData();
const sections: Record<string, { label: string; link: string }> = {
  'getting-started': { label: 'Get started', link: '/getting-started/' },
  charts: { label: 'Chart guides', link: '/charts/' },
  python: { label: 'Python & Jupyter', link: '/python/' },
  guides: { label: 'Guides', link: '/guides/' },
  fundamentals: { label: 'Guides', link: '/guides/' },
  customization: { label: 'Customization', link: '/customization/' },
  express: { label: 'Express API', link: '/express/' },
  extending: { label: 'Guides', link: '/guides/' },
  cookbook: { label: 'Recipes', link: '/cookbook/' },
  reference: { label: 'Reference', link: '/reference/' },
  demos: { label: 'Demos', link: '/demos/' },
};
const items = computed(() => {
  const relative = page.value.relativePath;
  const route = `/${relative.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;
  const first = relative.split('/')[0] ?? '';
  const section = sections[first];
  const crumbs = [{ label: 'Home', link: '/' }];
  if (section && section.link !== route) crumbs.push(section);
  if (first === 'charts') {
    const candidates = chartFamilies.filter((f) =>
      f.chartTypes.some((c) => c.docs.split('#')[0] === route),
    );
    const family =
      candidates.find((f) =>
        f.chartTypes.some(
          (c) => c.id === page.value.frontmatter.chart && c.docs.split('#')[0] === route,
        ),
      ) ?? candidates[0];
    if (family) crumbs.push({ label: family.label, link: `/gallery/?family=${family.id}` });
  }
  crumbs.push({ label: page.value.title, link: '' });
  return crumbs;
});
</script>

<template>
  <nav v-if="page.relativePath !== 'index.md'" class="hc-breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(item, index) in items" :key="index">
        <a v-if="item.link" :href="withBase(item.link)">{{ item.label }}</a>
        <span v-else aria-current="page">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
