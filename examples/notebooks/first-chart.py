# %% [markdown]
# # Your first notebook chart
# Complete the Python development-checkout installation first, select its kernel, and
# restart then Run All. The package is holochart-py; its import is holochart.
# This notebook uses five built-in weekly observations and makes no data requests.

# %% Check the kernel
import sys
from importlib.metadata import version
print("Python:", sys.version.split()[0])
print("Bridge:", version("holochart-py"))

# %% Imports and renderer
import plotly.graph_objects as go
import plotly.io as pio
from IPython.display import display
previous_renderer = pio.renderers.default
import holochart
from holochart import HolochartWidget
assert pio.renderers.default == previous_renderer
holochart.register_renderer(default=True)

# %% First figure
weeks = [1, 2, 3, 4, 5]
visits = [3, 1, 4, 2, 5]
fig = go.Figure(go.Scatter(x=weeks, y=visits, mode="lines+markers", name="Visits"))
_ = fig.update_layout(title="Notebook visits", xaxis_title="Week", yaxis_title="Count")

# %% Display
fig.show()

# %% Styling and one-output selection
fig.update_traces(marker={"size": 10, "color": "#a78bfa"}, line={"width": 2})
fig.show(renderer="holochart", config={"displayModeBar": False}, height=360)

# %% Replacement update in the same output
if "chart" in globals():
    chart.close()
chart = HolochartWidget(fig, height=360)
display(chart)
updated = go.Figure(fig)
updated.data[0].y = [4, 2, 5, 3, 6]
chart.figure = updated
assert chart.figure["data"][0]["y"] == [4, 2, 5, 3, 6]

# %% [markdown]
# The first output is a five-point line; the styled output hides its modebar.
# The direct-widget output updates in place: week 5 becomes 6.
# Next: use a pandas DataFrame in Plotly Express, compare bars, or drive a widget from a slider.
