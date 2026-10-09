import builtins
import datetime
import json

import numpy as np
import plotly.graph_objects as go
import pytest
from traitlets import TraitError

from holochart import HolochartWidget
from holochart.widget import _json_object


def test_dict_json_and_plotly_figure_inputs():
    figure = {"data": [{"type": "bar", "x": ["A"], "y": [3]}]}
    for value in (figure, json.dumps(figure), go.Figure(figure)):
        widget = HolochartWidget(value)
        assert widget.figure["data"] == figure["data"]
        bundle = widget._repr_mimebundle_()
        bundle = bundle[0] if isinstance(bundle, tuple) else bundle
        assert "application/vnd.jupyter.widget-view+json" in bundle
        widget.close()
    # The bridge does not mutate the caller's dictionary.
    assert "layout" not in figure


def test_array_dates_and_missing_values_are_json_safe():
    widget = HolochartWidget(
        {"data": [{"x": [datetime.date(2026, 1, 1)], "y": np.array([np.nan])}]}
    )
    assert widget.figure["data"][0] == {"x": ["2026-01-01"], "y": [None]}
    json.dumps(widget.figure, allow_nan=False)
    widget.close()


def test_plotly_encoded_arrays_and_frames_are_preserved():
    figure = go.Figure(go.Scatter(x=np.array([1, 2], dtype="int32"), y=[3, 4]))
    figure.frames = [go.Frame(data=[go.Scatter(y=[5, 6])], name="next")]
    widget = HolochartWidget(figure.to_json())
    assert widget.figure == json.loads(figure.to_json())
    assert widget.figure["frames"][0]["name"] == "next"
    widget.close()


def test_assignments_normalize_and_notify_and_do_not_share_state():
    widget = HolochartWidget()
    other = HolochartWidget()
    changes = []
    widget.observe(changes.append, names="figure")
    figure = {"data": [{"y": [1]}]}
    widget.figure = figure
    figure["data"][0]["y"].append(2)
    assert widget.figure["data"][0]["y"] == [1]
    assert len(changes) == 1
    assert other.figure == {}
    widget.config = {"displayModeBar": False}
    assert widget.get_state()["config"] == {"displayModeBar": False}
    widget.close()
    other.close()


@pytest.mark.parametrize("value", [[], 42, '"not an object"'])
def test_reject_non_figures(value):
    with pytest.raises(TraitError):
        HolochartWidget(value)


@pytest.mark.parametrize("dimensions", [{"width": 0}, {"height": -1}])
def test_dimensions_must_be_positive(dimensions):
    with pytest.raises(TraitError):
        HolochartWidget({}, **dimensions)


def test_plain_dicts_do_not_require_plotly(monkeypatch):
    original = builtins.__import__

    def without_plotly(name, *args, **kwargs):
        if name.startswith("plotly"):
            raise ModuleNotFoundError("No plotly", name="plotly")
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", without_plotly)
    assert _json_object({"data": [{"y": [1, float("nan")]}]}) == {
        "data": [{"y": [1, None]}]
    }
