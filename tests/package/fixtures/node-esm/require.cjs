// A CommonJS consumer (backlog decision 3): the packages are ESM-only, and Node 22+ loads them
// with require() through the `default` export condition (require(esm); no top-level await).
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS consumer, on purpose */
const assert = require('node:assert/strict');
const hc = require('@mk7s/holochart');

assert.equal(typeof hc.createChart, 'function', 'createChart');
assert.equal(typeof hc.supplyDefaults, 'function', 'supplyDefaults');
assert.equal(require('@mk7s/holochart/package.json').name, '@mk7s/holochart');
console.log('node-cjs: ok');
