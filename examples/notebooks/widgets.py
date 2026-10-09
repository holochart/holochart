# %% [markdown]
# # Direct widgets and replacement state
# The first figure matches gallery bar/basic, including Holochart's cornerradius extension.
# Dictionary and JSON-string widgets need only the base holochart-py install.
# The last optional section uses Plotly, so this complete notebook requires holochart-py[plotly].

# %% Imports
import json
from IPython.display import display
from holochart import HolochartWidget

# %% JSON-safe dictionary
if "chart" in globals():
    chart.close()
figure = {
    "data": [{"type": "bar", "x": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              "y": [12, 18, 7, -5, 21, 15, 9],
              "marker": {"line": {"width": 1.5, "color": "#ff9aa2"}, "cornerradius": 4}}],
    "layout": {}, "config": {"responsive": True},
}
chart = HolochartWidget(figure)
display(chart)

# %% Replace figure and config
replacement = json.loads(json.dumps(figure))
replacement["data"][0]["y"] = [15, 21, 10, -2, 24, 18, 12]
chart.figure = replacement
chart.config = {"displayModeBar": False}
assert chart.figure["data"][0]["y"] == [15, 21, 10, -2, 24, 18, 12]

# %% JSON string and explicit dimensions
if "json_chart" in globals():
    json_chart.close()
json_chart = HolochartWidget('{"data":[{"type":"scatter","x":[1,2,3],"y":[2,1,4]}],"layout":{"height":300}}', width=600, height=340)
display(json_chart)

# %% Plotly Figure input
import plotly.graph_objects as go
if "plotly_chart" in globals():
    plotly_chart.close()
plotly_chart = HolochartWidget(go.Figure(go.Scatter(x=[1, 2, 3], y=[2, 1, 4])), height=340)
display(plotly_chart)

# %% [markdown]
# Replace the figure/config trait to notify the widget. In-place edits such as chart.figure['data'][0]['y'][0] = 99
# do not notify traitlets. JSON-safe state is copied; changing the original figure does not change the widget.
# With no width, output fills the notebook cell. Default height is 450; layout dimensions win over defaults,
# and explicit widget dimensions win over layout. Removed views dispose their browser charts.
# Browser hover/selection events and browser-driven axis edits do not synchronize back to Python.

# %% [markdown]
# ## Exact standalone gallery counterpart
# The literal figure below preserves the browser source data for the single-chart download.
# It is not displayed again here; the download creates exactly one widget.

# %% Standalone gallery figure
gallery_figure_bar_basic = {'data': [{'type': 'bar',
           'x': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
           'y': [12, 18, 7, -5, 21, 15, 9],
           'marker': {'line': {'width': 1.5, 'color': '#ff9aa2'}, 'cornerradius': 4}}],
 'layout': {},
 'config': {'responsive': True}}
