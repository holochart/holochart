<script setup lang="ts">
/** Lightweight lower-guide variation link preserves each legacy embedded-example anchor. */
import { withBase } from 'vitepress';
import { data } from '../data/chart-guides.data.ts';
import { exampleAnchor } from '../example-anchor.ts';
const props = withDefaults(defineProps<{ id: string; anchor?: boolean }>(), { anchor: true });
</script>
<template>
  <p :id="anchor === false ? undefined : exampleAnchor(id)" class="hc-example-link">
    <a v-if="data.examples[props.id]" :href="withBase(`/gallery/example/${id}`)"
      >View {{ data.examples[props.id]?.title ?? id }}: chart, complete source and downloads →</a
    >
    <template v-else
      >Repository performance example: <code>examples/{{ id }}.ts</code>.
      <a :href="withBase('/getting-started/installation#try-it-from-the-monorepo')"
        >Run this source locally</a
      >
      and select <code>{{ id }}</code> in the sandbox. This stress case is excluded from published
      gallery thumbnails.</template
    >
  </p>
</template>
<style>
.hc-example-link {
  scroll-margin-top: 90px;
  font-size: 13px;
}
</style>
