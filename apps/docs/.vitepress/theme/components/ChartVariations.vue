<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { data } from '../data/chart-guides.data.ts';
const { page } = useData();
const variations = computed(() =>
  (data.guides[page.value.relativePath]?.variations ?? [])
    .map((id) => data.examples[id]!)
    .filter(Boolean),
);
</script>
<template>
  <nav
    v-if="variations.length"
    class="hc-chart-variations"
    aria-label="Complete variation examples"
  >
    <a v-for="entry in variations" :key="entry.id" :href="withBase(`/gallery/example/${entry.id}`)">
      <img
        :src="withBase(`/${entry.thumbnail}`)"
        :alt="entry.title"
        :width="entry.thumbnailSize.width"
        :height="entry.thumbnailSize.height"
        loading="lazy"
      />
      <strong>{{ entry.title }}</strong
      ><span>{{ entry.description }}</span
      ><small v-if="entry.python">Verified Python variant</small>
    </a>
  </nav>
</template>
<style>
.hc-chart-variations {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0 28px;
}
.vp-doc .hc-chart-variations a {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  text-decoration: none;
}
.hc-chart-variations img {
  width: 100%;
  height: 96px;
  object-fit: contain;
  background: var(--vp-c-bg-soft);
}
.hc-chart-variations strong {
  margin-top: 7px;
  font-size: 13px;
  line-height: 19px;
}
.hc-chart-variations span,
.hc-chart-variations small {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}
@media (max-width: 960px) {
  .hc-chart-variations {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 520px) {
  .hc-chart-variations {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
