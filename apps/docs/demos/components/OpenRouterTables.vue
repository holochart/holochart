<script setup lang="ts">
/**
 * The OpenRouter demo's HTML tables (the `table` trace is not released yet): the fit comparison
 * and the weekly data. Values come from the same analysis module as the charts, so the page, the
 * charts and the tables always agree. Rendered at build time (no chart code runs here).
 */
import {
  AIC,
  BEST_AIC,
  expFn,
  fmtDate,
  fmtT,
  pct,
  R2,
  WEEKS,
} from '@mk7s/holochart-examples/demos/openrouter/analysis.mts';

defineProps<{ table: 'fits' | 'weeks' }>();

const fits = [
  { name: 'Exponential', form: 'A·e^kt', r2: R2.exp, aic: AIC.exp, best: true },
  { name: 'Quadratic', form: 'a + bt + ct²', r2: R2.quad, aic: AIC.quad, best: false },
  { name: 'Linear', form: 'a + bt', r2: R2.lin, aic: AIC.lin, best: false },
].map((f) => ({ ...f, r2: f.r2.toFixed(3), daic: (f.aic - BEST_AIC).toFixed(1) }));
const linearDelta = (AIC.lin - BEST_AIC).toFixed(0);

const weeks = WEEKS.map((d, i) => {
  const prev = WEEKS[i - 1];
  return {
    week:
      fmtDate(d.week, { month: 'short', day: 'numeric', year: 'numeric' }) +
      (d.partial ? ' (partial)' : ''),
    tokens: fmtT(d.tokensT),
    change: prev && !d.partial ? pct(d.tokensT / prev.tokensT - 1) : '—',
    fit: fmtT(expFn(i)),
    top: d.top[0]?.[0] ?? '—',
  };
});
</script>

<template>
  <div v-if="table === 'fits'" class="hc-table-wrap">
    <table class="hc-num-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Form</th>
          <th class="n">R²</th>
          <th class="n">ΔAIC</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in fits" :key="f.name" :class="{ best: f.best }">
          <td>{{ f.name }}</td>
          <td>
            <code>{{ f.form }}</code>
          </td>
          <td class="n">{{ f.r2 }}</td>
          <td class="n">{{ f.daic }}</td>
        </tr>
      </tbody>
    </table>
    <p class="hc-table-note">
      ΔAIC under 2 is a tie; over 10 rules a model out. The quadratic ties the exponential because
      both bend upward. The straight line is ruled out (Δ ≈ {{ linearDelta }}).
    </p>
  </div>
  <div v-else class="hc-table-wrap hc-table-scroll">
    <table class="hc-num-table">
      <thead>
        <tr>
          <th>Week of</th>
          <th class="n">Tokens</th>
          <th class="n">vs prior week</th>
          <th class="n">Exp. fit</th>
          <th>Top model</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="w in weeks" :key="w.week">
          <td>{{ w.week }}</td>
          <td class="n">{{ w.tokens }}</td>
          <td class="n">{{ w.change }}</td>
          <td class="n">{{ w.fit }}</td>
          <td>
            <code>{{ w.top }}</code>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
