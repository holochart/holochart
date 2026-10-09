"""JSON-safe, synchronized figures for anywidget."""

import json
from collections.abc import Mapping
from pathlib import Path

import anywidget
import traitlets

_BUNDLE = Path(__file__).parent / "static/widget.js"


def _json_object(value):
    if isinstance(value, str):
        value = json.loads(value)
    elif hasattr(value, "to_plotly_json"):
        value = value.to_plotly_json()
    if not isinstance(value, Mapping):
        raise traitlets.TraitError("Expected a figure dictionary, JSON object, or Plotly Figure.")
    # Plotly's encoder handles NumPy arrays/scalars, dates, and missing values.
    # Plain dictionaries work without installing Plotly.
    try:
        from plotly.utils import PlotlyJSONEncoder
    except ModuleNotFoundError:
        encoder = json.JSONEncoder
    else:
        encoder = PlotlyJSONEncoder
    return json.loads(json.dumps(dict(value), cls=encoder), parse_constant=lambda _: None)


class HolochartWidget(anywidget.AnyWidget):
    """Display a dict, JSON string, or Plotly Figure with the bundled Holochart renderer.

    Assign a new `figure` or `config` to update an existing output. In-place edits
    do not notify traitlets. Width and height override figure dimensions when set;
    otherwise width fills the output and height defaults to 450 pixels.
    """

    _esm = _BUNDLE
    figure = traitlets.Any(default_value={}).tag(sync=True)
    config = traitlets.Dict(default_value={}).tag(sync=True)
    width = traitlets.Int(default_value=None, allow_none=True, min=1).tag(sync=True)
    height = traitlets.Int(default_value=None, allow_none=True, min=1).tag(sync=True)

    def __init__(self, figure=None, *, config=None, width=None, height=None, **kwargs):
        if not _BUNDLE.is_file():
            raise RuntimeError(
                "The notebook bundle is missing. Build/install holochart-py first; "
                "see packages/holochart-py/README.md."
            )
        super().__init__(
            figure={} if figure is None else figure,
            config={} if config is None else config,
            width=width,
            height=height,
            **kwargs,
        )

    @traitlets.validate("figure", "config")
    def _validate_json(self, proposal):
        return _json_object(proposal["value"])
