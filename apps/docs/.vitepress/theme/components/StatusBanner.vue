<script setup lang="ts">
/**
 * Shows the page's completeness from frontmatter: `status: stub` pages get a "coming in
 * <milestone>" notice, `status: draft` pages a draft notice. Complete pages show nothing.
 */
import { computed } from 'vue';
import { useData } from 'vitepress';

const { frontmatter } = useData();

const status = computed(() => String(frontmatter.value['status'] ?? ''));
const milestone = computed(() => String(frontmatter.value['milestone'] ?? 'a later milestone'));
</script>

<template>
  <div v-if="status === 'stub'" class="hc-status custom-block warning" data-status="stub">
    <p class="custom-block-title">Coming in {{ milestone }}</p>
    <p>
      This page is a placeholder. It lists what the page will cover; content arrives with
      {{ milestone }}.
    </p>
  </div>
  <div v-else-if="status === 'draft'" class="hc-status custom-block info" data-status="draft">
    <p class="custom-block-title">Draft</p>
    <p>This page is incomplete and may change as Holochart approaches its first alpha.</p>
  </div>
</template>
