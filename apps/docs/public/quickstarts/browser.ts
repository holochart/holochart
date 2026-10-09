import { createChart } from '@mk7s/holochart';

const element = document.getElementById('chart');
const updateButton = document.getElementById('update');
const disposeButton = document.getElementById('dispose');
const status = document.getElementById('status');
if (!element || !updateButton || !disposeButton || !status) {
  throw new Error('The quick-start page is missing its chart or controls.');
}

const chart = createChart(element, {
  data: [
    {
      type: 'scatter',
      x: [1, 2, 3, 4, 5],
      y: [3, 1, 4, 2, 5],
      mode: 'lines+markers',
      name: 'Visits',
    },
    { type: 'bar', x: [1, 2, 3, 4, 5], y: [2, 2, 3, 1, 4], name: 'Signups' },
  ],
  layout: {
    title: { text: 'Weekly traffic' },
    xaxis: { title: { text: 'Week' } },
    yaxis: { title: { text: 'Count' } },
  },
  config: { responsive: true },
});

let disposed = false;
async function update() {
  if (disposed) return;
  await chart.update({ data: [{ y: [4, 2, 5, 3, 6] }] }, { traces: [0] });
  if (status) status.textContent = 'Visits updated: week 5 is now 6.';
}
function dispose() {
  if (disposed) return;
  disposed = true;
  chart.destroy();
  updateButton?.removeEventListener('click', onUpdate);
  disposeButton?.removeEventListener('click', dispose);
  window.removeEventListener('pagehide', dispose);
  if (status) status.textContent = 'Chart disposed. Reload the page to create it again.';
}
function onUpdate() {
  void update().catch((error) => {
    if (status) status.textContent = String(error);
  });
}
updateButton.addEventListener('click', onUpdate);
disposeButton.addEventListener('click', dispose);
window.addEventListener('pagehide', dispose);
void chart.ready.then(() => {
  if (status && !disposed) status.textContent = 'Chart ready. Click Update visits.';
});
