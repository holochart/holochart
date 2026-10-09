<script setup lang="ts">
/** A small weather glyph for the live weather demo's day strip, one per sky family. */
import type { Sky } from '@mk7s/holochart-examples/demos/live-weather/data.mts';

defineProps<{ sky: Sky }>();

const CLOUD = 'M15 33a7.5 7.5 0 0 1 .6-15 10.5 10.5 0 0 1 20.2 2.2A6.5 6.5 0 0 1 35 33z';
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];
</script>

<template>
  <svg class="hc-lw-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <g
      v-if="sky === 'clear' || sky === 'partly'"
      :transform="sky === 'partly' ? 'translate(8 -6) scale(0.8)' : ''"
    >
      <circle cx="24" cy="24" r="8.5" fill="#f2b736" />
      <line
        v-for="a in RAYS"
        :key="a"
        x1="24"
        y1="9.5"
        x2="24"
        y2="5"
        stroke="#f08a3a"
        stroke-width="3"
        stroke-linecap="round"
        :transform="`rotate(${a} 24 24)`"
      />
    </g>
    <g v-if="sky === 'fog'" stroke="#a4a7b5" stroke-width="3" stroke-linecap="round">
      <line x1="10" y1="18" x2="38" y2="18" />
      <line x1="14" y1="25" x2="34" y2="25" />
      <line x1="10" y1="32" x2="38" y2="32" />
    </g>
    <path
      v-if="sky !== 'clear' && sky !== 'fog'"
      :d="CLOUD"
      fill="#d5d8e3"
      :transform="
        sky === 'partly'
          ? 'translate(-3 5)'
          : sky === 'cloudy'
            ? 'translate(0 -1)'
            : 'translate(0 -7)'
      "
    />
    <g
      v-if="sky === 'rain' || sky === 'drizzle'"
      stroke="#3aa0c8"
      stroke-width="3"
      stroke-linecap="round"
    >
      <line x1="19" y1="31" x2="16" y2="38" />
      <line v-if="sky === 'rain'" x1="26" y1="31" x2="23" y2="38" />
      <line x1="33" y1="31" x2="30" y2="38" />
    </g>
    <g v-if="sky === 'snow'" fill="#c9d3f2">
      <circle cx="17" cy="33" r="2.2" />
      <circle cx="25" cy="37" r="2.2" />
      <circle cx="32" cy="33" r="2.2" />
    </g>
    <path v-if="sky === 'storm'" d="M26 27l-7 9h5l-2 8 8-10h-5l3-7z" fill="#f2b736" />
  </svg>
</template>
