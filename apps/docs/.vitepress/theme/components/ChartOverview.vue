<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { exampleAnchor } from '../example-anchor.ts';
import { data } from '../data/chart-guides.data.ts';
const { page } = useData();
const guide = computed(() => data.guides[page.value.relativePath]);
const example = computed(() => (guide.value ? data.examples[guide.value.minimal] : undefined));
</script>
<template>
  <aside
    v-if="guide && example"
    class="hc-chart-overview"
    :aria-label="`${guide.title} at a glance`"
  >
    <a :href="`#${exampleAnchor(example.id)}`" class="hc-chart-overview-thumb"
      ><img
        :src="withBase(`/${example.thumbnail}`)"
        :alt="example.title"
        :width="example.thumbnailSize.width"
        :height="example.thumbnailSize.height"
    /></a>
    <div>
      <p class="hc-chart-overview-purpose">{{ example.description }}</p>
      <p class="hc-chart-overview-shape">{{ guide.dataShape }}</p>
      <nav class="hc-chart-overview-links" aria-label="Guide shortcuts">
        <a href="#minimal-example">Minimal example</a
        ><a href="#variations">{{ guide.variations.length }} variations</a
        ><a href="#data-format">Data shape</a
        ><a :href="withBase(`/reference/${guide.chart}`)">Attribute reference</a
        ><a :href="withBase(`/gallery/example/${guide.minimal}`)">Complete source & downloads</a>
      </nav>
      <p class="hc-chart-overview-support">
        {{ guide.support }}
        <span v-if="example.python">The minimal example has a verified Python variant.</span>
      </p>
    </div>
  </aside>
</template>
<style>
.hc-chart-overview {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  margin: 18px 0 24px;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}
.hc-chart-overview-thumb img {
  width: 100%;
  height: auto;
  display: block;
}
.vp-doc .hc-chart-overview p {
  margin: 0 0 6px;
}
.hc-chart-overview-purpose {
  font-size: 14px;
  line-height: 21px;
  color: var(--vp-c-text-1);
}
.hc-chart-overview-shape,
.hc-chart-overview-support {
  font-size: 12px;
  line-height: 19px;
  color: var(--vp-c-text-2);
}
.hc-chart-overview-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 8px 0;
  font-size: 12px;
}
@media (max-width: 640px) {
  .hc-chart-overview {
    grid-template-columns: minmax(0, 1fr);
  }
  .hc-chart-overview-thumb {
    max-width: 180px;
  }
  .hc-chart-overview-links a {
    min-height: 44px;
    display: flex;
    align-items: center;
  }
}
</style>
