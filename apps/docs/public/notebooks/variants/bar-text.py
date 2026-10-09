# %% [markdown]
# # bar/text: Python counterpart
# Generated from examples/notebooks/comparison-bars.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure bar/text
figure_bar_text = {'data': [{'type': 'bar',
           'name': 'Revenue',
           'x': ['North', 'South', 'East', 'West', 'Central'],
           'y': [42.5, 3.2, 27.8, 35.1, 1.4],
           'texttemplate': '$%{value:.1f}M',
           'textposition': 'auto'},
          {'type': 'bar',
           'name': 'Growth',
           'x': ['North', 'South', 'East', 'West', 'Central'],
           'y': [12, -4, 8, 15, -2],
           'texttemplate': '%{value:+d}%',
           'textposition': 'outside'},
          {'type': 'bar',
           'name': 'Share',
           'orientation': 'h',
           'y': ['A', 'B', 'C'],
           'x': [48, 31, 21],
           'text': ['Alpha', 'Beta', 'Gamma'],
           'textposition': 'inside',
           'insidetextanchor': 'middle',
           'xaxis': 'x2',
           'yaxis': 'y2',
           'marker': {'color': ['#9962c0', '#f2c14e', '#128b8b']}}],
 'layout': {'xaxis': {'domain': [0, 0.62]},
            'xaxis2': {'domain': [0.7, 1], 'anchor': 'y2'},
            'yaxis2': {'anchor': 'x2'}},
 'config': {'responsive': True}}

# %% Display bar/text
if "chart_bar_text" in globals():
    chart_bar_text.close()
chart_bar_text = HolochartWidget(figure_bar_text, height=440)
assert chart_bar_text.figure == figure_bar_text
display(chart_bar_text)
