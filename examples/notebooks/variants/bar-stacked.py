# %% [markdown]
# # bar/stacked: Python counterpart
# Generated from examples/notebooks/comparison-bars.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure bar/stacked
figure_bar_stacked = {'data': [{'type': 'bar',
           'name': 'Hardware',
           'x': ['2024-01-01',
                 '2024-02-01',
                 '2024-03-01',
                 '2024-04-01',
                 '2024-05-01',
                 '2024-06-01'],
           'y': [14, 16, 13, 18, 21, 19],
           'marker': {'line': {'width': 1, 'color': '#0a0a0f'}}},
          {'type': 'bar',
           'name': 'Software',
           'x': ['2024-01-01',
                 '2024-02-01',
                 '2024-03-01',
                 '2024-04-01',
                 '2024-05-01',
                 '2024-06-01'],
           'y': [9, 11, 14, 12, 15, 18],
           'marker': {'line': {'width': 1, 'color': '#0a0a0f'}}},
          {'type': 'bar',
           'name': 'Services',
           'x': ['2024-01-01',
                 '2024-02-01',
                 '2024-03-01',
                 '2024-04-01',
                 '2024-05-01',
                 '2024-06-01'],
           'y': [5, 4, 7, 9, 8, 11],
           'marker': {'line': {'width': 1, 'color': '#0a0a0f'}}}],
 'layout': {'xaxis': {'dtick': 'M1'}, 'barmode': 'stack', 'barcornerradius': 6},
 'config': {'responsive': True}}

# %% Display bar/stacked
if "chart_bar_stacked" in globals():
    chart_bar_stacked.close()
chart_bar_stacked = HolochartWidget(figure_bar_stacked, height=450)
assert chart_bar_stacked.figure == figure_bar_stacked
display(chart_bar_stacked)
