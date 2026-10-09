/** A view owns its chart; updates are serialized and coalesce while a render is pending. */
export function createWidget(holochart) {
  return {
    render({ model, el }) {
      const container = document.createElement('div');
      const status = document.createElement('div');
      status.setAttribute('role', 'alert');
      status.hidden = true;
      el.append(container, status);

      let disposed = false;
      let pending = false;
      let running = false;
      let mounted = false;

      async function drain() {
        running = true;
        while (pending && !disposed) {
          pending = false;
          try {
            // figureFromJSON handles Plotly 6+'s {dtype, bdata, shape} NumPy encoding.
            const figure = holochart.figureFromJSON(model.get('figure'));
            const width = model.get('width') ?? figure.layout?.width;
            const height = model.get('height') ?? figure.layout?.height ?? 450;
            container.style.width = width == null ? '100%' : `${width}px`;
            container.style.height = `${height}px`;
            figure.layout = {
              ...figure.layout,
              ...(width == null ? {} : { width }),
              height,
            };
            figure.config = { ...figure.config, ...model.get('config') };
            if (mounted) {
              await holochart.react(container, figure);
            } else {
              await holochart.newPlot(container, figure);
              mounted = true;
            }
            if (!disposed) {
              status.hidden = true;
              status.textContent = '';
            }
          } catch (error) {
            holochart.purge(container);
            mounted = false;
            if (!disposed) {
              status.textContent = `Holochart: ${error instanceof Error ? error.message : String(error)}`;
              status.hidden = false;
            }
          }
        }
        running = false;
      }

      function update() {
        if (disposed) return;
        pending = true;
        if (!running) void drain();
      }

      const events = ['change:figure', 'change:config', 'change:width', 'change:height'];
      for (const event of events) model.on(event, update);
      update();

      return () => {
        disposed = true;
        for (const event of events) model.off(event, update);
        holochart.purge(container);
        container.remove();
        status.remove();
      };
    },
  };
}
