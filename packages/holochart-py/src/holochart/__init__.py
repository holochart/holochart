"""Holochart's Python notebook bridge."""

from .widget import HolochartWidget

__version__ = "0.0.0"
__all__ = ["HolochartWidget", "register_renderer"]


def register_renderer(*, default=False, **kwargs):
    """Register Plotly's 'holochart' renderer; optionally select it for fig.show()."""
    try:
        from .renderer import register_renderer as register
    except ModuleNotFoundError as error:
        if error.name == "plotly":
            raise ImportError(
                'Install the Plotly bridge with `pip install "holochart-py[plotly]"`.'
            ) from error
        raise
    return register(default=default, **kwargs)
