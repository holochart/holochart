<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts';
import StatusBanner from './components/StatusBanner.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #doc-before>
      <StatusBanner />
    </template>
  </Layout>
</template>
