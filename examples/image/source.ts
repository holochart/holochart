import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A picture from a data URI (plan E11.3): `source` holds a base64 PNG (32 × 20 px, with a
 * transparent corner), whose size is read from its header so the axes fit it before it is
 * decoded. Decoded pixels also feed the hover label (`z` as 8-bit RGBA). A scatter trace marks a
 * point of interest on top, in pixel coordinates; as in Plotly, an axis shared with another trace
 * type is not reversed for the image, so `autorange: 'reversed'` keeps row 0 at the top.
 */
export const meta: ExampleMeta = {
  title: 'Image: picture from a data URI',
  description: 'A small PNG given as a base64 data URI, with a marker drawn over it.',
  tags: ['image', 'scientific', 'source', 'data-uri'],
  testTolerance: 0.004,
};

const SUNSET =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAUCAYAAADskT9PAAABoUlEQVR42sXOwYrTUBSA4fMQRUopoZZSQoghhHAJ4RpiiDHUkCmBkcHRwixEQRAGXLhw7d61e9ezdy249I2O/yAFrekwamkW3+rec84vrvNOeuixSOS83aXHJPedy1/pscmj2ZstHYJ0d19f06HIs8UrHZK8XL7QIcmld6FDkvf3NnpI+u3pH276Lx+icz2UvuNb+2bkoznTQ7jp+FbfnHyyp3oItwnom5PPDzr9H3Fj1SBBCosMOXYD+ublqm71X4QnViPEMEiQwiJDjuLk94i+PfKlfax/K+ishogQwyBBCosMOQqUqLqfIX27ZHRq9Q6+PqlvxedvgBARYhgkSGGRIUeBEhXqPTdkdEYAxvj+/OFeLu8efAQIESGGQYIUFhlyFChRocYKzc4dGZ0TgDEmmMLBDHMssIQLDz4ChIgQwyBBCosMOQqUqFBjhQYt1uggow0BGGOCKRzMMMcCS7jw4CNAiAgxDBKksMiQo0CJCjVWaNBijW5zHXBBAMaYYAoHM8yxwBIuPPgIECJCDIMEKSwy5ChQokKNFRq0WKPDD9fu9Wb3KdhfAAAAAElFTkSuQmCC';

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'image', source: SUNSET },
      {
        type: 'scatter',
        x: [22],
        y: [12],
        mode: 'markers+text',
        text: ['sun'],
        textposition: 'top center',
        marker: { size: 10, symbol: 'circle-open', color: '#fff' },
      },
    ],
    layout: {
      title: { text: 'Sunset (PNG source)' },
      yaxis: { autorange: 'reversed' },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
