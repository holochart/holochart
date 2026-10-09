<script setup lang="ts">
import { computed } from 'vue';
import { withBase } from 'vitepress';
import {
  installStatus,
  registryInstallCommand,
  releaseState,
  sourceInstallState,
  type InstallEcosystem,
} from '../../release-state';

const props = defineProps<{ ecosystem?: InstallEcosystem }>();
const paths = computed(() => {
  const entries = [
    {
      ecosystem: 'javascript',
      label: 'JavaScript / TypeScript',
      artifact: releaseState.npm,
      href: '/getting-started/installation#try-it-from-the-monorepo',
      source: sourceInstallState.javascript,
    },
    {
      ecosystem: 'python',
      label: 'Python / Jupyter',
      artifact: releaseState.pypi,
      href: '/getting-started/installation#python-and-jupyter-from-source',
      source: sourceInstallState.python,
    },
  ];
  return entries.filter((entry) => !props.ecosystem || props.ecosystem === entry.ecosystem);
});
</script>

<template>
  <aside class="custom-block info" aria-label="Package availability">
    <p class="custom-block-title">Install availability</p>
    <p v-for="entry in paths" :key="entry.ecosystem">
      <strong>{{ entry.label }}</strong> — {{ installStatus(entry.artifact) }}.
      <template v-if="registryInstallCommand(entry.artifact)">
        <br />
        <code>{{ registryInstallCommand(entry.artifact) }}</code>
      </template>
      <template v-else>
        <a :href="withBase(entry.href)">Source setup instructions</a>.
        <template v-if="!entry.source.publicRef">
          Requires a development checkout containing <code>{{ entry.source.requiredPath }}</code
          >; no public source revision has been verified for this package.
        </template>
      </template>
    </p>
    <p v-if="!props.ecosystem">
      npm and PyPI are released independently. Local builds do not make registry or CDN installs
      available.
    </p>
  </aside>
</template>
