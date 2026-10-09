import plotly.graph_objects as go
import plotly.io as pio
import pytest

from holochart import HolochartWidget, register_renderer


@pytest.fixture(autouse=True)
def restore_default():
    previous = pio.renderers.default
    yield
    pio.renderers.default = previous


def test_registration_is_explicit():
    previous = pio.renderers.default
    renderer = register_renderer()
    assert pio.renderers["holochart"] is renderer
    assert pio.renderers.default == previous
    register_renderer(default=True)
    assert pio.renderers.default == "holochart"


def test_unchanged_fig_show_displays_widget_and_forwards_options(monkeypatch):
    import plotly.io._renderers as renderers

    displayed = []
    widgets = []
    original = HolochartWidget._repr_mimebundle_

    def capture(widget, **kwargs):
        widgets.append(widget)
        return original(widget, **kwargs)

    monkeypatch.setattr(HolochartWidget, "_repr_mimebundle_", capture)
    monkeypatch.setattr(renderers.ipython_display, "display", lambda bundle, **_: displayed.append(bundle))
    register_renderer(default=True, config={"scrollZoom": False})
    fig = go.Figure(go.Scatter(x=[1, 2], y=[3, 4]))
    fig.show(config={"displayModeBar": False}, width=800, height=400)
    assert len(displayed) == len(widgets) == 1
    assert displayed[0]["application/vnd.jupyter.widget-view+json"]["model_id"] == widgets[0].model_id
    assert widgets[0].figure == fig.to_plotly_json()
    assert widgets[0].config == {"displayModeBar": False}
    assert (widgets[0].width, widgets[0].height) == (800, 400)
    assert pio.renderers["holochart"].config == {"scrollZoom": False}
    widgets[0].close()


def test_one_off_renderer_and_implicit_display(monkeypatch):
    import plotly.io._renderers as renderers

    displayed = []
    monkeypatch.setattr(renderers.ipython_display, "display", lambda bundle, **_: displayed.append(bundle))
    register_renderer()
    go.Figure(go.Bar(y=[1])).show(renderer="holochart")
    assert "application/vnd.jupyter.widget-view+json" in displayed[0]
    register_renderer(default=True)
    assert "application/vnd.jupyter.widget-view+json" in go.Figure()._repr_mimebundle_()
