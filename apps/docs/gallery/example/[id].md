---
title: Gallery example
description: A complete chart example with source downloads, dependency instructions and related chart guides.
status: complete
layout: page
search: false
---

<script setup>
import { useData } from 'vitepress';
import ExampleDetail from '/.vitepress/theme/components/ExampleDetail.vue';
const { params } = useData();
</script>

<ExampleDetail :entry="params.entry" :related="params.related" />
