<script setup lang="ts">
/** A row of headline figures (demo pages): a big value, what it is, and a small aside. */
defineProps<{
  items: readonly { value: string; label: string; aside?: string }[];
}>();
</script>

<template>
  <section class="hc-stats" aria-label="Headline figures">
    <div v-for="item in items" :key="item.label" class="hc-stat">
      <div class="hc-stat-value">{{ item.value }}</div>
      <div class="hc-stat-label">{{ item.label }}</div>
      <div v-if="item.aside" class="hc-stat-aside">{{ item.aside }}</div>
    </div>
  </section>
</template>
