"""A Plotly MIME renderer that displays a live anywidget view."""

import plotly.io as pio
from plotly.io._base_renderers import MimetypeRenderer

from .widget import HolochartWidget


class HolochartRenderer(MimetypeRenderer):
    def __init__(self, *, config=None, width=None, height=None):
        self.config = config
        self.width = width
        self.height = height

    def to_mimebundle(self, fig_dict):
        widget = HolochartWidget(
            fig_dict, config=self.config, width=self.width, height=self.height
        )
        bundle = widget._repr_mimebundle_()
        # ipywidgets versions return either data or (data, metadata).
        return bundle[0] if isinstance(bundle, tuple) else bundle


def register_renderer(*, default=False, **kwargs):
    """Register once per kernel; importing holochart never changes Plotly defaults."""
    renderer = HolochartRenderer(**kwargs)
    pio.renderers["holochart"] = renderer
    if default:
        pio.renderers.default = "holochart"
    return renderer
