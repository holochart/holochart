# %% [markdown]
# # histogram/notebook-starter: Python counterpart
# Generated from examples/notebooks/histogram.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure histogram/notebook-starter
gallery_figure_histogram_notebook_starter = {'data': [{'type': 'histogram',
           'x': [1, 2, 2, 3, 4, 4, 5],
           'xbins': {'start': 0.5, 'end': 5.5, 'size': 1},
           'name': 'Observations'}],
 'layout': {'title': {'text': 'Small sample histogram'},
            'xaxis': {'title': {'text': 'Value'}},
            'yaxis': {'title': {'text': 'Count'}}},
 'config': {'responsive': True}}

# %% Display histogram/notebook-starter
if "gallery_chart_histogram_notebook_starter" in globals():
    gallery_chart_histogram_notebook_starter.close()
gallery_chart_histogram_notebook_starter = HolochartWidget(gallery_figure_histogram_notebook_starter, height=450)
assert gallery_chart_histogram_notebook_starter.figure == gallery_figure_histogram_notebook_starter
display(gallery_chart_histogram_notebook_starter)
