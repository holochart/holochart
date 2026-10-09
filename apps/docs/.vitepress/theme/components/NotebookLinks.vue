<script setup lang="ts">
import { withBase } from 'vitepress';

defineProps<{ slug: string; sourcePage?: boolean; variant?: string }>();
</script>

<template>
  <div class="notebook-links" role="group" aria-label="Notebook and Python source">
    <a :href="withBase(`/notebooks/${slug}.ipynb`)" download>Download notebook</a>
    <a v-if="!sourcePage && !variant" :href="withBase(`/python/notebooks/${slug}`)"
      >View Python source</a
    >
    <a
      :href="withBase(variant ? `/notebooks/variants/${variant}.py` : `/notebooks/${slug}.py`)"
      download
    >
      {{ variant ? 'Download exact variant .py' : 'Download .py' }}
    </a>
  </div>
</template>

<style scoped>
.notebook-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.8rem 0 1.2rem;
}
.notebook-links a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-weight: 600;
}
</style>
