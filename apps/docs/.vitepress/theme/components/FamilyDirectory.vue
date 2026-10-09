<script setup lang="ts">
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { data, type HomeFamily } from '../data/home.data.ts';

const props = defineProps<{ compact?: boolean; families?: HomeFamily[] }>();
const families = computed(() => props.families ?? data.families);
</script>

<template>
  <div
    class="hc-card-grid hc-family-directory"
    :class="{ 'hc-family-directory--compact': compact }"
  >
    <template v-for="entry in families" :key="entry.family.id">
      <a v-if="compact" :href="withBase(`/gallery/${entry.family.id}/`)" class="hc-family-tile">
        <img
          v-if="entry.preview"
          :src="withBase(`/${entry.preview.thumbnail}`)"
          :alt="`${entry.family.label}: ${entry.preview.title}`"
          :width="entry.preview.thumbnailSize.width"
          :height="entry.preview.thumbnailSize.height"
          loading="lazy"
        />
        <div v-else class="hc-family-tile-placeholder" aria-hidden="true" />
        <div class="hc-family-tile-body">
          <h3>{{ entry.family.label }}</h3>
          <p>{{ entry.family.description }}</p>
          <span>{{ entry.count }} examples →</span>
        </div>
      </a>
      <section v-else class="hc-card">
        <h2>
          <a :href="withBase(`/gallery/${entry.family.id}/`)">{{ entry.family.label }}</a>
        </h2>
        <p>{{ entry.family.description }}</p>
        <ul class="hc-card-links">
          <li v-for="chart in entry.family.chartTypes" :key="chart.id">
            <a :href="withBase(chart.docs)">{{ chart.label }}</a>
          </li>
        </ul>
        <a class="hc-card-action" :href="withBase(`/gallery/${entry.family.id}/`)"
          >Browse {{ entry.count }} examples →</a
        >
      </section>
    </template>
  </div>
</template>

<style>
.hc-family-tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--hc-grid);
  border-radius: 4px;
  background: var(--hc-surface-1);
}
.hc-family-tile:hover {
  border-color: var(--hc-zero);
}
.hc-family-tile img,
.hc-family-tile-placeholder {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16/9;
  object-fit: contain;
  background: var(--hc-bg);
}
.hc-family-tile-body {
  padding: 12px;
}
.hc-family-tile-body h3 {
  color: var(--vp-c-text-1);
  font-weight: 500;
  font-size: 16px;
  line-height: 22px;
  margin: 0 0 5px;
}
.hc-family-tile-body p {
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 22px;
  margin: 0 0 8px;
}
.hc-family-tile-body > span {
  color: var(--vp-c-brand-1);
  font-size: 13px;
  line-height: 20px;
}
</style>
