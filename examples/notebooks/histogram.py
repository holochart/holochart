# %% [markdown]
# # A small sample histogram
# This figure matches gallery histogram/notebook-starter in JavaScript and Python.
# Seven observations fall into five bins centered on 1 through 5, with counts 1, 2, 1, 2, 1.
# Explicit xbins make the boundaries reproducible. This dictionary input needs only holochart-py;
# it does not need Plotly, pandas, NumPy, an external dataset or a network request.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Data and figure
values = [1, 2, 2, 3, 4, 4, 5]
figure = {
    "data": [{
        "type": "histogram",
        "x": values,
        "xbins": {"start": 0.5, "end": 5.5, "size": 1},
        "name": "Observations",
    }],
    "layout": {
        "title": {"text": "Small sample histogram"},
        "xaxis": {"title": {"text": "Value"}},
        "yaxis": {"title": {"text": "Count"}},
    },
    "config": {"responsive": True},
}
assert [values.count(center) for center in range(1, 6)] == [1, 2, 1, 2, 1]

# %% Display
if "histogram_chart" in globals():
    histogram_chart.close()
histogram_chart = HolochartWidget(figure, height=360)
assert histogram_chart.figure == figure
display(histogram_chart)

# %% [markdown]
# ## Exact standalone gallery counterpart
# The literal figure below preserves the browser source data for the single-chart download.
# It is not displayed again here; the download creates exactly one widget.

# %% Standalone gallery figure
gallery_figure_histogram_notebook_starter = {'data': [{'type': 'histogram',
           'x': [1, 2, 2, 3, 4, 4, 5],
           'xbins': {'start': 0.5, 'end': 5.5, 'size': 1},
           'name': 'Observations'}],
 'layout': {'title': {'text': 'Small sample histogram'},
            'xaxis': {'title': {'text': 'Value'}},
            'yaxis': {'title': {'text': 'Count'}}},
 'config': {'responsive': True}}
