# %% [markdown]
# # Mixed traces with graph_objects
# This initial figure matches the gallery's line/with-bars example, including its built-in data.
# Install holochart-py[plotly] into this kernel. No pandas, NumPy or data downloads are required.

# %% Imports and renderer defaults
import plotly.graph_objects as go
import holochart
holochart.register_renderer(default=True, config={"scrollZoom": False, "displayModeBar": True}, height=400)

# %% Mixed traces and explicit layout
fig = go.Figure([
    go.Scatter(x=[1, 2, 3, 4, 5], y=[3, 1, 4, 2, 5], mode="lines+markers", name="Visits"),
    go.Bar(x=[1, 2, 3, 4, 5], y=[2, 2, 3, 1, 4], name="Signups"),
])
fig.update_layout(title="Weekly traffic", xaxis_title="Week", yaxis_title="Count")
fig.show(config={"responsive": True})

# %% Per-output dimensions and replacement config
fig.show(renderer="holochart", config={"displayModeBar": False}, width=640, height=320)

# %% [markdown]
# register_renderer sets defaults for later outputs. Per-show width and height override those defaults.
# Per-show config replaces the renderer default config: this last output does not retain scrollZoom=False.
# Widget config then overrides any keys in a figure's own config in the browser.
# Python graph_objects creates ordinary traces. graph/chord/graph3d and geo extensions are not bundled.

# %% [markdown]
# ## Exact standalone gallery counterpart
# The literal figure below preserves the browser source data for the single-chart download.
# It is not displayed again here; the download creates exactly one widget.

# %% Standalone gallery figure
gallery_figure_line_with_bars = {'data': [{'type': 'scatter',
           'x': [1, 2, 3, 4, 5],
           'y': [3, 1, 4, 2, 5],
           'mode': 'lines+markers',
           'name': 'Visits'},
          {'type': 'bar', 'x': [1, 2, 3, 4, 5], 'y': [2, 2, 3, 1, 4], 'name': 'Signups'}],
 'layout': {'title': {'text': 'Weekly traffic'},
            'xaxis': {'title': {'text': 'Week'}},
            'yaxis': {'title': {'text': 'Count'}}},
 'config': {'responsive': True}}
