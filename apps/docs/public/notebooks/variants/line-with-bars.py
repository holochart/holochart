# %% [markdown]
# # line/with-bars: Python counterpart
# Generated from examples/notebooks/graph-objects.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure line/with-bars
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

# %% Display line/with-bars
if "gallery_chart_line_with_bars" in globals():
    gallery_chart_line_with_bars.close()
gallery_chart_line_with_bars = HolochartWidget(gallery_figure_line_with_bars, height=450)
assert gallery_chart_line_with_bars.figure == gallery_figure_line_with_bars
display(gallery_chart_line_with_bars)
