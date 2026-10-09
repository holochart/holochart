# %% [markdown]
# # box/precomputed: Python counterpart
# Generated from examples/notebooks/distribution-starters.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure box/precomputed
figure_box_precomputed = {'data': [{'type': 'box',
           'name': 'Quarterly revenue',
           'x': ['Q1', 'Q2', 'Q3', 'Q4'],
           'q1': [42, 48, 51, 60],
           'median': [47, 52, 58, 66],
           'q3': [53, 57, 64, 74],
           'lowerfence': [30, 36, 40, 45],
           'upperfence': [68, 70, 80, 95],
           'mean': [48, 52.5, 57, 67.5],
           'sd': [7, 6, 8.5, 11],
           'notchspan': [2.5, 2, 3, 3.5]}],
 'layout': {'title': {'text': 'Store revenue per quarter (summaries)'},
            'yaxis': {'title': {'text': 'kUSD'}}}}

# %% Display box/precomputed
if "chart_box_precomputed" in globals():
    chart_box_precomputed.close()
chart_box_precomputed = HolochartWidget(figure_box_precomputed, height=450)
assert chart_box_precomputed.figure == figure_box_precomputed
display(chart_box_precomputed)
