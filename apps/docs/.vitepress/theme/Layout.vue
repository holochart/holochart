<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts';
import { withBase } from 'vitepress';
import StatusBanner from './components/StatusBanner.vue';
import Breadcrumbs from './components/Breadcrumbs.vue';

const { Layout } = DefaultTheme;
// With scripting enabled, HTML parses <noscript> contents as one text node. Keep the
// server markup opaque to Vue so hydration does not expect navigation child VNodes.
const noScriptNavigation = `<nav class="hc-noscript-navigation" aria-label="Navigation without JavaScript">
JavaScript is disabled. Documentation and source downloads remain available.
${[
  ['/getting-started/', 'Get started'],
  ['/gallery/', 'Gallery'],
  ['/python/', 'Python &amp; Jupyter'],
  ['/guides/', 'Guides'],
  ['/reference/', 'Reference'],
  ['/demos/', 'Demos'],
]
  .map(([href, label]) => `<a href="${withBase(href!)}">${label}</a>`)
  .join(' ')}
</nav>`;
</script>

<template>
  <Layout>
    <template #layout-top>
      <noscript v-html="noScriptNavigation" />
    </template>
    <template #doc-before>
      <Breadcrumbs />
      <StatusBanner />
    </template>
  </Layout>
</template>

<style>
.hc-noscript-navigation {
  padding: 72px 24px 16px;
  background: var(--hc-surface-1);
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 24px;
}
.hc-noscript-navigation a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin: 0 8px;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}
</style>
